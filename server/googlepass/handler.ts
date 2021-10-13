import * as t from 'io-ts';
import pluralize from 'pluralize';
import cloneDeep from 'lodash/cloneDeep';
import cloneDeepWith from 'lodash/cloneDeepWith';
import { v4 as uuid } from 'uuid';
import { oneLineTrim as markdown } from 'common-tags';
import { GoogleAuth } from 'google-auth-library';

import { Logger, NotFoundError } from '@navch/common';
import { makeHandler, makeRouter } from '@navch/express';

import * as service from './service';
import { WalletClass, WalletObject } from './model';
import { buildPassTemplates, PassTemplate } from './template';
import { buildPassTemplateCache } from '../cache';
import { decode } from '../decoder';
import { resolveTemplateValue } from '../utils';
import { GooglePayPassConfig } from '../config';

export type HandlerContext = {
  readonly config: GooglePayPassConfig;
};

export const buildRouter = makeRouter(({ config }: HandlerContext) => {
  const { issuerId, credentials } = config;
  const client = new GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/wallet_object.issuer'],
  });

  /**
   * It is recommended to cache the prepared PassModel in memory to be reused by multiple
   * requests to reduce the overhead of hitting the filesystem.
   */
  const passTemplateCache = buildPassTemplateCache<PassTemplate>();
  const refreshPassTemplateCache = async (logger: Logger, forceReload = false) => {
    if (forceReload || passTemplateCache.size === 0) {
      const templates = await buildPassTemplates({ logger });
      await Promise.all(templates.map(item => passTemplateCache.setItem(item)));
    }
  };

  return [
    makeHandler({
      route: '/',
      method: 'GET',
      input: {
        query: t.type({
          templateId: t.string,
          /**
           * The value for `barcode.value` field in the created `WalletObject`.
           *
           * @see {@link https://developers.google.com/pay/passes/rest/v1/Barcode}
           */
          barcode: t.string,
          /**
           * An optional payload to fill the Pass template. If undefined, the application
           * will attempt to decode it from the given `barcode`.
           *
           * The field values are lookup via `Lodash#get` function, you must specify each
           * templated field in `key: a.b[1].c` format. If no matched value found from the
           * payload, original value in the template will be used.
           */
          payload: t.union([t.string, t.undefined]),
          /**
           * By default, both the PayPass class definition (issuer metadata, styles, etc.)
           * are included in the JWT token, which may cause the resulting URL to exceed the
           * 1800 characters limitation.
           *
           * To prevent URL truncation by browsers, you can use the "Skinny JWT variation"
           * that instruct the handler to insert both the PayPass class and object when,
           * processing a request and only embed `object id` field in the JWT token.
           */
          mode: t.union([t.literal('auto'), t.literal('skinny'), t.undefined]),
          /**
           * The Pass templates are cached in memory during the application runtime. See
           * usages of `passTemplateCache` for details.
           *
           * However, it's annoying when you're frequently modifying the Pass templates
           * during development that the changes aren't been pickup automatically.
           *
           * You can set this parameter to any truthy value to force refreshing.
           */
          forceReload: t.union([t.string, t.undefined]),
          /**
           * The inserted PayPass class will be reused by consecutive requests, which is
           * not ideal when you're frequently modifying the templates during development
           * that the changes aren't been populated.
           *
           * You can set this parameter to any truthy value to force updating the class.
           */
          forceUpdate: t.union([t.string, t.undefined]),
        }),
      },
      handle: async (_1, args, { req, res, logger }) => {
        const { templateId, barcode, payload, mode, forceReload, forceUpdate } = args;
        logger.info('Generate PayPass with arguments', args);

        // Refresh the local Wallet Pass templates if needed
        await refreshPassTemplateCache(logger, Boolean(forceReload));

        // Fine Google PayPass template by ID
        const passTemplate = await passTemplateCache.getItem(templateId);
        if (!passTemplate) {
          throw new NotFoundError(`No template found with ID "${templateId}"`);
        }
        const { classType, classTemplate, objectType, objectTemplate } = passTemplate;

        // Attempt to obtain the PayPass template payload by decoding the input
        // barcode when `payload` argument is undefined.
        //
        const passPayload = payload
          ? { payload: JSON.parse(payload), rawData: payload }
          : await decode(barcode, logger);
        logger.debug('Generate PayPass with decoded payload', passPayload);

        // Construct the PayPass class with the template if provided
        //
        const classRecord: WalletClass = {
          ...classTemplate,
          id: `${issuerId}.${templateId}`,
          reviewStatus: 'approved', // 'underReview',
        };

        // Construct the PayPass object with the decoded payload by substituting field
        // values in the generated pass with the input data.
        //
        const objectFields = {
          pass: {
            id: `${issuerId}.${uuid()}`,
            classId: classRecord.id,
            barcode,
            issuerId,
          },
          data: passPayload.payload,
        };
        const objectRecord: WalletObject = cloneDeepWith(cloneDeep(objectTemplate), key => {
          if (typeof key !== 'string') return undefined;
          return resolveTemplateValue(objectFields, key);
        });

        // Generate JWT token for "Save To Android Pay" button
        //
        // https://developers.google.com/pay/passes/guides/implement-the-api/save-passes-to-google-pay
        const token = await Promise.resolve().then(async () => {
          if (classType && mode === 'skinny') {
            await service.createWalletClass({
              logger,
              client,
              classType,
              classInput: classRecord,
              forceUpdate: Boolean(forceUpdate),
            });
            const walletObject = await service.createWalletObject({
              logger,
              client,
              objectType,
              objectInput: { ...objectRecord, classId: classRecord.id },
            });
            return await service.signPayPassToken({
              logger,
              issuer: credentials.client_email,
              issuerKey: credentials.private_key,
              payload: {
                [pluralize(objectType)]: [{ id: walletObject.id }],
              },
            });
          } else {
            return await service.signPayPassToken({
              logger,
              issuer: credentials.client_email,
              issuerKey: credentials.private_key,
              payload: {
                [pluralize(objectType)]: [objectRecord],
                ...(classType && { [pluralize(classType)]: [classRecord] }),
              },
            });
          }
        });
        logger.debug('Signed PayPass JWT token', { token });

        const redirectTo = `https://pay.google.com/gp/v/save/${token}`;
        logger.info('Generated Google Pay URL', { url: redirectTo });

        if (req.headers['accept'] === 'application/json') {
          res.send({ token, redirectTo });
        } else {
          res.redirect(redirectTo);
        }
      },
    }),
    makeHandler({
      route: '/templates',
      method: 'GET',
      description: markdown`
        List the available Google PayPass templates in this application. These
        are predefined PayPass class objects.
      `,
      handle: async (_1, _2, { res, logger }) => {
        logger.debug('Return predefined Google PayPass templates');
        await refreshPassTemplateCache(logger);

        const payPassTemplates = await passTemplateCache.getAll();
        const results = payPassTemplates.map(template => ({
          templateId: template.templateId,
          description: template.description,
        }));
        res.send(results);
      },
    }),
  ];
});
