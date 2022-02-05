import R from 'ramda';
import * as t from 'io-ts';
import { isString } from 'lodash';
import { oneLineTrim as markdown } from 'common-tags';

import { Logger, NotFoundError } from '@navch/common';
import { makeHandler, makeHandlers } from '@navch/http';

import { createWalletPass } from './service';
import { Storage } from '../storage';
import { AppConfig } from '../config';
import { Decoder } from '../decoder/types';
import { decode } from '../decoder/service';
import { getLocalTemplates } from '../template/service';
import { PassCredentials, PassTemplateDefinition } from './types';

export type Options = {
  readonly config: AppConfig;
  readonly storage: Storage;
  readonly decoders: Decoder[];
};

export const buildGooglePassHandlers = makeHandlers(({ config, storage, decoders }: Options) => {
  // Refresh the local Wallet Pass templates if needed
  const refreshPassTemplateCache = async (logger: Logger, forceReload = false) => {
    if (forceReload || storage.isEmpty()) {
      const items = await getLocalTemplates({
        logger,
        schema: PassTemplateDefinition,
        rootDir: config.googlePassTemplatesPath,
      });
      await Promise.all(items.map(item => storage.setItem(item.id, item)));
    }
  };

  // Fine Wallet Pass template by ID
  const findTemplateById = async (logger: Logger, templateId: string, forceReload = false) => {
    await refreshPassTemplateCache(logger, forceReload);
    const result = await storage.getItem<PassTemplateDefinition>(templateId);
    if (!result) {
      throw new NotFoundError(`No template found with ID "${templateId}"`);
    }
    return result;
  };

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
          credentials: PassCredentials,
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
      handle: async (_1, args, { logger }) => {
        const { template, credentials, barcode, dynamicData, mode, forceReload, forceUpdate } = args;
        logger.info('Generate Google Pay Pass with arguments', { template });

        const passTemplate = isString(template)
          ? await findTemplateById(logger, template, Boolean(forceReload))
          : template;

        // Attempt to obtain the template data from the barcode message
        const decoded = await decode(decoders, barcode);

        // Merge template data with request-scoped dynamic data if provided
        const payload = dynamicData ? R.mergeDeepRight(decoded, dynamicData) : decoded;

        const token = await createWalletPass({
          logger,
          template: passTemplate,
          credentials,
          barcode,
          payload,
          useSkinnyToken: mode === 'skinny',
          forceUpdate: Boolean(forceUpdate),
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
        await refreshPassTemplateCache(logger);

        const templates = await storage.getAll<PassTemplateDefinition>();
        return templates.sort(R.ascend(x => x.description)).map(item => ({
          templateId: item.id,
          description: item.description,
        }));
      },
    }),
  ];
});
