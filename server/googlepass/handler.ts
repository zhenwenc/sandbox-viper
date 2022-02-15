import R from 'ramda';
import * as t from 'io-ts';
import { isString } from 'lodash';
import { oneLineTrim as markdown } from 'common-tags';

import { Logger } from '@navch/common';
import { makeHandler, makeHandlers } from '@navch/http';

import { createWalletPass } from './service';
import { Storage } from '../storage';
import { AppConfig } from '../config';
import { encrypt, decrypt } from '../secret';
import { Decoder } from '../decoder/types';
import { decode } from '../decoder/service';
import { getLocalTemplates, buildTemplateCache } from '../template/service';
import { PassCredentials, PassTemplateDefinition } from './types';

export type Options = {
  readonly config: AppConfig;
  readonly storage: Storage;
  readonly decoders: Decoder[];
};

export const buildGooglePassHandlers = makeHandlers(({ config, decoders }: Options) => {
  const templateCache = buildTemplateCache({
    fetchTemplates: async (logger: Logger) => {
      return await getLocalTemplates({
        logger,
        schema: PassTemplateDefinition,
        rootDir: config.googlePassTemplatesPath,
      });
    },
  });

  return [
    makeHandler({
      route: '/',
      method: 'POST',
      input: {
        body: t.type({
          /**
           * The definition of a template to be used for generating the pass bundle, or
           * the identifier of a predefined template.
           */
          template: t.union([t.string, PassTemplateDefinition]),
          /**
           * The credentials to sign the generated pass bundle.
           *
           * TODO maybe support JWKs
           */
          credentials: t.union([t.string, PassCredentials]),
          /**
           * The value for `barcode.value` field in the created `WalletObject`.
           *
           * @see {@link https://developers.google.com/pay/passes/rest/v1/Barcode}
           */
          barcode: t.string,
          /**
           * Additional data to fill the pass template. By default, the application will
           * attempt to decode and provide data from the given `barcode`.
           *
           * The field values are lookup via `Lodash#get` function, you must specify each
           * templated field in `key: a.b[1].c` format. If no matched value found from the
           * payload, original value in the template will be used.
           */
          dynamicData: t.union([t.record(t.string, t.unknown), t.undefined]),
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
           * The predefined templates are cached in memory during the application runtime.
           * See usages of `storage` for details.
           *
           * However, it's annoying when you're frequently modifying the Pass templates
           * during development that the changes aren't been pickup automatically.
           *
           * You can set this parameter to any truthy value to force refreshing.
           */
          forceReload: t.union([t.boolean, t.undefined]),
          /**
           * The inserted PayPass class will be reused by consecutive requests, which is
           * not ideal when you're frequently modifying the templates during development
           * that the changes aren't been populated.
           *
           * You can set this parameter to any truthy value to force updating the class.
           */
          forceUpdate: t.union([t.boolean, t.undefined]),
        }),
      },
      handle: async (_1, args, { logger }) => {
        const { template, credentials, barcode, dynamicData, mode, forceReload, forceUpdate } = args;
        const { getServerCerts } = config;
        logger.info('Generate Google Pay Pass with arguments', { template });

        // Refresh the local templates if needed, useful for development
        if (Boolean(forceReload)) await templateCache.clear();

        const passTemplate: PassTemplateDefinition = isString(template)
          ? await templateCache.findById(logger, template)
          : template;

        const passCredentials: PassCredentials = isString(credentials)
          ? await decrypt(await getServerCerts(), credentials, PassCredentials)
          : credentials;

        // Attempt to obtain the template data from the barcode message
        const decoded = await decode(decoders, barcode);

        // Merge template data with request-scoped dynamic data if provided
        const payload = dynamicData ? R.mergeDeepRight(decoded, dynamicData) : decoded;

        const token = await createWalletPass({
          logger,
          template: passTemplate,
          credentials: passCredentials,
          barcode,
          payload,
          forceUpdate: Boolean(forceUpdate),
          useSkinnyToken: mode === 'skinny' && Boolean(passTemplate.classTemplate),
        });

        const redirectTo = `https://pay.google.com/gp/v/save/${token}`;
        logger.info('Generated Google Pay URL', { url: redirectTo });

        return { token, redirectTo };
      },
    }),
    makeHandler({
      route: '/templates',
      method: 'GET',
      description: markdown`
        List the available Google PayPass templates in this application. These
        are predefined PayPass class objects.
      `,
      handle: async (_1, _2, { logger }) => {
        logger.debug('Return predefined Google PayPass templates');
        await templateCache.clear();

        const templates = await templateCache.getAll(logger);
        return templates.sort(R.ascend(x => x.description)).map(item => ({
          templateId: item.id,
          description: item.description,
        }));
      },
    }),
    makeHandler({
      route: '/secrets',
      method: 'POST',
      description: markdown`
        Encode the credentials in an encrypted message which can be used to invoke the pass
        generation endpoint.
      `,
      input: {
        body: t.type({
          /**
           * The credentials to sign the generated pass token. See the pass generation
           * endpoint for details.
           */
          credentials: PassCredentials,
        }),
      },
      handle: async (_1, { credentials }, { logger }) => {
        logger.debug('Encrypt Google Pay Pass credentials');
        const secret = await config.getServerCerts();
        const result = await encrypt(secret, credentials);
        return { data: result };
      },
    }),
  ];
});
