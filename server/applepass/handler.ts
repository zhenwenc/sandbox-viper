import R from 'ramda';
import * as t from 'io-ts';
import { isString } from 'lodash';
import { oneLineTrim as markdown } from 'common-tags';
import { Pass } from 'passkit-generator';

import { Logger, NotFoundError } from '@navch/common';
import { Response, makeHandler, makeHandlers } from '@navch/http';

import { Storage } from '../storage';
import { PassTemplate, PassTemplateDefinition, PassCredentials } from './model';
import { decode } from '../decoder/service';
import { buildPassTemplates, buildDynamicTemplate } from './template';
import { ApplePassConfig } from '../config';
import { createWalletPass } from './service';

export type ApplePassOptions = {
  readonly storage: Storage;
};

export const buildApplePassHandlers = makeHandlers(({ storage }: ApplePassOptions) => {
  const config = new ApplePassConfig();

  /**
   * It is recommended to cache the prepared PassModel in memory to be reused by multiple
   * requests to reduce the overhead of hitting the filesystem.
   */
  const refreshPassTemplateCache = async (logger: Logger, forceReload = false) => {
    if (forceReload || storage.isEmpty()) {
      const templates = await buildPassTemplates({ logger, config });
      await Promise.all(templates.map(item => storage.setItem(item.templateId, item)));
    }
  };

  const findPassTemplate = async (templateId: string, logger: Logger, forceReload = false) => {
    // Refresh the local Wallet Pass templates if needed
    await refreshPassTemplateCache(logger, Boolean(forceReload));

    // Fine Wallet Pass template by ID
    const result = await storage.getItem<PassTemplate>(templateId);
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
           * The template that used to generate the pass bundle, or the id of a predefined
           * template (use value of the `serialNumber` property).
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
        logger.info('Generate Apple Wallet Pass with custom template');

        const passTemplate = isString(template)
          ? await findPassTemplate(template, logger, Boolean(forceReload))
          : await buildDynamicTemplate({ definition: template, credentials });

        // Attempt to obtain the Wallet Pass template data from the barcode message
        const decoded = await decode(barcode, logger);

        // Merge template data with request-scoped dynamic data if provided
        const payload = dynamicData ? R.mergeDeepRight(decoded, dynamicData) : decoded;

        const pass = await createWalletPass({
          logger,
          barcode,
          payload,
          template: passTemplate,
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
      handle: async (_1, _2, ctx) => {
        ctx.logger.debug('Return predefined iOS Wallet Pass templates');
        await refreshPassTemplateCache(ctx.logger);

        const iosPassTemplates = await storage.getAll<PassTemplate>();
        return iosPassTemplates.sort(R.ascend(x => x.model?.description)).map(template => ({
          templateId: template.templateId,
          description: template.model?.description,
        }));
      },
    }),
  ];
});
