import * as t from 'io-ts';
import { v4 as uuid } from 'uuid';
import { oneLineTrim as markdown } from 'common-tags';
import { GoogleAuth } from 'google-auth-library';

import { Logger, NotFoundError } from '@navch/common';
import { makeHandler, makeRouter } from '@navch/express';

import * as service from './android.service';
import { buildPassTemplates, PassTemplate } from './android.template';
import { buildPassTemplateCache } from './cache';
import { decode } from './decoder';
import { AppConfig } from '../config';

export type HandlerContext = {
  readonly config: AppConfig;
};

export const buildRouter = makeRouter(({ config }: HandlerContext) => {
  const credentials = config.googleCredentials;
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
           * The Pass templates are cached in memory during the application runtime. See
           * usages of `passTemplateCache` for details.
           *
           * However, it's annoying when you're frequently modifying the Pass templates
           * during development that the changes aren't been pickup automatically.
           *
           * You can set this parameter to any truthy value to force refreshing.
           */
          forceReload: t.union([t.string, t.undefined]),
        }),
      },
      handle: async (_1, args, { res, logger }) => {
        const { templateId, barcode, payload, forceReload } = args;
        const { issuerId } = config.googlePass;
        logger.info('Generate Google Pay Pass with arguments', args);

        // Refresh the local Wallet Pass templates if needed
        await refreshPassTemplateCache(logger, Boolean(forceReload));

        // Fine Google Pay Pass template by ID
        const passTemplate = await passTemplateCache.getItem(templateId);
        if (!passTemplate) {
          throw new NotFoundError(`No template found with ID "${templateId}"`);
        }

        // Generate random unique identifier for this pass
        const accountId = uuid();

        // Attempt to obtain the Pay Pass template payload by decoding the input
        // barcode when `payload` argument is undefined.
        const passPayload = payload ? { subject: JSON.parse(payload) } : await decode(barcode, logger);
        logger.debug('Generate Google Pay Pass with decoded payload', passPayload);

        // Create Google Pay Pass class if not already exists.
        const walletClass = await service.createWalletClass({
          logger,
          client,
          classType: passTemplate.classType,
          classInput: {
            ...passTemplate.classReference,
            id: `${issuerId}.${passTemplate.templateId}`,
            reviewStatus: 'underReview',
          },
          forceUpdate: Boolean(forceReload),
        });

        // TODO Construct the Pay Pass object with the decoded payload.
        const walletObjectInput = {
          id: `${issuerId}.${accountId}`,
          barcode: { type: 'qrCode', value: barcode },
          classId: walletClass.id,
          classReference: undefined,

          accountId: accountId,
          accountName: 'Jack',
          state: 'active',
          loyaltyPoints: {
            balance: {
              int: 101,
            },
            label: 'Points',
          },
        };

        // Create the Google Pay Pass object
        const walletObject = await service.createWalletObject({
          logger,
          client,
          objectType: passTemplate.objectType,
          objectInput: walletObjectInput,
        });
        logger.debug('Created Google Pay Pass object', { data: walletObject });

        // Create JWT Token for "Save to Wallet" button
        const token = await service.signPayPassToken({
          logger,
          recordType: 'loyaltyObject',
          records: [walletObject],
          issuer: credentials.client_email,
          issuerKey: credentials.private_key,
        });
        logger.debug('Signed Google Pay Pass', { token });

        const redirectTo = `https://pay.google.com/gp/v/save/${token}`;
        res.send({ redirectTo, token });
      },
    }),
    makeHandler({
      route: '/templates',
      method: 'GET',
      description: markdown`
        List the available Google Pay Pass templates in this application. These
        are predefined Pay Pass class objects.
      `,
      handle: async (_1, _2, { res, logger }) => {
        logger.debug('Return predefined Google Pay Pass templates');
        res.send({ data: [] }); // TODO
      },
    }),
  ];
});
