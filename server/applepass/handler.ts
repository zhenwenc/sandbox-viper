import R from 'ramda';
import * as t from 'io-ts';
import { isString } from 'lodash';
import { oneLineTrim as markdown } from 'common-tags';
import { PKPass } from 'passkit-generator';

import { Logger } from '@navch/common';
import { Response, makeHandler, makeHandlers } from '@navch/http';

import { Storage } from '../storage';
import { AppConfig } from '../config';
import { getLocalTemplates, buildTemplateCache } from '../template/service';
import { encrypt, decrypt } from '../secret';
import { Decoder } from '../decoder/types';
import { decode } from '../decoder/service';
import { PassTemplateDefinition, PassCredentials } from './types';
import { createWalletPass, createTemplateZip } from './service';

export type Options = {
  readonly config: Pick<AppConfig, 'applePassTemplatesPath' | 'getServerCerts'>;
  readonly storage: Storage;
  readonly decoders: Decoder[];
};

export const buildApplePassHandlers = makeHandlers(({ config, decoders }: Options) => {
  const templateCache = buildTemplateCache({
    fetchTemplates: async (logger: Logger) => {
      return await getLocalTemplates({
        logger,
        schema: PassTemplateDefinition,
        rootDir: config.applePassTemplatesPath,
      });
    },
  });

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
  const sendWalletPass = (logger: Logger, res: Response, pkpass: PKPass) => {
    const stream = pkpass.getAsStream();

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
          credentials: t.union([t.string, PassCredentials]),
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
          forceReload: t.union([t.boolean, t.undefined]),
        }),
      },
      handle: async (_1, args, { response, logger }) => {
        const { template, credentials, barcode, dynamicData, forceReload } = args;
        const { getServerCerts } = config;
        logger.info('Generate Apple Wallet Pass with arguments', { template });

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

        const pass = await createWalletPass({
          logger,
          barcode,
          payload,
          template: passTemplate,
          credentials: passCredentials,
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
        await templateCache.clear();

        const templates = await templateCache.getAll(logger);
        return templates.sort(R.ascend(x => x.model?.description)).map(item => ({
          templateId: item.id,
          description: item.model?.description,
        }));
      },
    }),
    makeHandler({
      route: '/templates/convert',
      method: 'POST',
      description: markdown`
        Converts the given template from the sandbox specific structure into a ZIP archive.

        This is useful if you were using the sandbox for exploration, and you're ready to
        export your template for later use.
      `,
      input: {
        body: t.type({
          /**
           * The definition of a template to be converted.
           */
          template: PassTemplateDefinition,
          /**
           * Exports the template metadata to a file in the archive when specified.
           */
          metadataFileName: t.union([t.undefined, t.string]),
        }),
      },
      handle: async (_1, { template, metadataFileName }, { logger }) => {
        logger.debug('Converts Apple Wallet Pass template');
        return createTemplateZip({ logger, template, metadataFileName });
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
           * The credentials to sign the generated pass bundle. See the pass generation
           * endpoint for details.
           */
          credentials: PassCredentials,
        }),
      },
      handle: async (_1, { credentials }, { logger }) => {
        logger.debug('Encrypt Apple Wallet Pass credentials');
        const secret = await config.getServerCerts();
        const result = await encrypt(secret, credentials);
        return { data: result };
      },
    }),
  ];
});
