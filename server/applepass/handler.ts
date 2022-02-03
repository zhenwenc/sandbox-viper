import R from 'ramda';
import * as t from 'io-ts';
import { isString } from 'lodash';
import { oneLineTrim as markdown } from 'common-tags';
import { Pass } from 'passkit-generator';

import { Logger, NotFoundError } from '@navch/common';
import { Response, makeHandler, makeHandlers } from '@navch/http';

import { Storage } from '../storage';
import { AppConfig } from '../config';
import { getLocalTemplates } from '../template/service';
import { PassTemplateDefinition, PassCredentials } from './types';
import { decode } from '../decoder/service';
import { createWalletPass } from './service';

export type ApplePassOptions = {
  readonly config: AppConfig;
  readonly storage: Storage;
};

export const buildApplePassHandlers = makeHandlers(({ config, storage }: ApplePassOptions) => {
  // Refresh the local Wallet Pass templates if needed
  const refreshPassTemplateCache = async (logger: Logger, forceReload = false) => {
    if (forceReload || storage.isEmpty()) {
      const items = await getLocalTemplates({
        logger,
        schema: PassTemplateDefinition,
        rootDir: config.applePassTemplatesPath,
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

  /**
   * Sends the generated Apple Pass bundle as response payload.
   *
   * NOTE: Example for Express/Connect handler:
   *
   * res.writeHead(200, {
   *   'Content-type': 'application/vnd.apple.pkpass',
   *   'Content-disposition': `attachment; filename=${passName}.pkpass`,
   * });
   * stream.pipe(res);
   */
  const sendWalletPass = (logger: Logger, res: Response, pass: Pass) => {
    const stream = pass.generate();

    // Generate the stream .pkpass file stream
    const passName = `viper-${Date.now()}`;
    logger.info(`Generated pkpass file: ${passName}`);

    res.set({
      'Content-type': 'application/vnd.apple.pkpass',
      'Content-disposition': `attachment; filename=${passName}.pkpass`,
    });
    res.body = stream;
  };

  return [
    makeHandler({
      route: '/',
      method: 'POST',
      description: markdown`
        This advanced endpoint orchestrates the Apple Wallet Pass generation using the
        given resources in the request payload.

        You can invoke this API from a web browser, then open the downloaded .pkpass file
        with the macOS built-in Pass Viewer application, or inspect the Pass in iPhone
        Simulator. The download .pkpass file can also be added to the real iPhone device
        via AirDrop.

        This endpoint responses binary data with "application/vnd.apple.pkpass" as the
        content-type that can be detected by Apple devices. For example, you can download
        the .pkpass directly from the iPhone's browser, you should be prompted to add the
        downloaded Pass into your Apple Wallet.
      `,
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
           * The value for `barcode.message` field in `pass.json`.
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
           * The predefined templates are cached in memory during the application runtime.
           * See usages of `storage` for details.
           *
           * However, it's annoying when you're frequently modifying the Pass templates
           * during development that the changes aren't been pickup automatically.
           *
           * You can set this parameter to any truthy value to force refreshing.
           */
          forceReload: t.union([t.string, t.undefined]),
        }),
      },
      handle: async (_1, args, { response, logger }) => {
        const { template, credentials, barcode, dynamicData, forceReload } = args;
        logger.info('Generate Apple Wallet Pass with arguments', { template });

        const passTemplate: PassTemplateDefinition = isString(template)
          ? await findTemplateById(logger, template, Boolean(forceReload))
          : template;

        // Attempt to obtain the template data from the barcode message
        const decoded = await decode(barcode, logger);

        // Merge template data with request-scoped dynamic data if provided
        const payload = dynamicData ? R.mergeDeepRight(decoded, dynamicData) : decoded;

        const pass = await createWalletPass({
          logger,
          barcode,
          payload,
          template: passTemplate,
          credentials,
        });
        sendWalletPass(logger, response, pass);
      },
    }),
    makeHandler({
      route: '/templates',
      method: 'GET',
      description: markdown`
        List the available Apple Wallet Pass templates in the application. This could be
        useful to find a template with dynamic identifier.
      `,
      handle: async (_1, _2, { logger }) => {
        logger.debug('Return predefined Apple Wallet Pass templates');
        await refreshPassTemplateCache(logger);

        const templates = await storage.getAll<PassTemplateDefinition>();
        return templates.sort(R.ascend(x => x.model?.description)).map(item => ({
          templateId: item.id,
          description: item.model?.description,
        }));
      },
    }),
  ];
});
