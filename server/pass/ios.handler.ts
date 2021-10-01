import * as t from 'io-ts';
import { get } from 'lodash';
import { v4 as uuid } from 'uuid';
import { oneLineTrim as markdown } from 'common-tags';
import { createPass } from 'passkit-generator';

import { Logger, NotFoundError } from '@navch/common';
import { makeHandler, makeRouter } from '@navch/express';

import { buildPassTemplates, buildPassTemplateCache } from './ios.template';
import { decode } from './decoder';

export const buildRouter = makeRouter(() => {
  let passTemplateCacheExpiry = -1;

  /**
   * It is recommended to cache the prepared PassModel in memory to be reused by multiple
   * requests to reduce the overhead of hitting the filesystem.
   */
  const passTemplateCache = buildPassTemplateCache();
  const refreshPassTemplateCache = async (logger: Logger, forceReload = false) => {
    if (forceReload || Date.now() > passTemplateCacheExpiry) {
      const templates = await buildPassTemplates(logger);
      await Promise.all(templates.map(item => passTemplateCache.setItem(item)));
      passTemplateCacheExpiry = Date.now() + 3600 * 1000;
    }
  };

  return [
    makeHandler({
      route: '/pass/ios',
      method: 'GET',
      description: markdown`
        The primary endpoint for generating Apple Wallet Pass from a defined template.

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
        query: t.type({
          templateId: t.string,
          /**
           * The value for `barcode.message` field in `pass.json`.
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
        logger.info('Generate iOS Wallet Pass with arguments', args);
        const { templateId, barcode, payload, forceReload } = args;

        // Refresh the local Wallet Pass templates if needed
        await refreshPassTemplateCache(logger, Boolean(forceReload));

        // Fine Wallet Pass template by ID
        const passTemplate = await passTemplateCache.getItem(templateId);
        if (!passTemplate) {
          throw new NotFoundError(`No template found with ID "${templateId}"`);
        }
        logger.debug('Generate iOS Wallet Pass with template');

        // Attempt to obtain the Wallet Pass template payload by decoding the input
        // barcode when `payload` argument is undefined.
        const passPayload = payload ? JSON.parse(payload) : await decode(barcode, logger);
        logger.debug('Generate iOS Wallet Pass with decoded payload', passPayload);

        const pass = await createPass(passTemplate.abstractModel, undefined, {
          overrides: {
            /**
             * Assign a unique identifier for the generated Wallet Pass.
             *
             * The combination of pass type identifier and serial number is used throughout
             * PassKit to uniquely identify a pass. Two passes of the same type with the same
             * serial number are understood to be the same pass, even if other information
             * on them differs.
             *
             * This field is important if you intent to push Pass Updates.
             * @see {@link https://developer.apple.com/documentation/walletpasses}
             */
            serialNumber: uuid(),
            authenticationToken: uuid(),
          },
        });

        // Adding some settings to be written inside pass.json
        pass.barcodes(barcode);

        // TODO Why the library's `FieldsArray#splice` function doesn't work?
        //      It will results in an invalid Pass bundle.
        //
        // Substitute field values in the generated pass with the input data. The ordering
        // of fields within the list is significant.
        //
        // NOTE When the barcode format is PKBarcodeFormatQR, the two `secondaryFields` and
        // `auxiliaryFields` fields will be combined into one row. Watch out for the maximum
        // number of displayable fields.
        //
        // NOTE Yet another pitfall, the "value" attribute must always be defined for each,
        // field in the template, otherwise it won't be picked up by the library.
        //
        const fieldArrays = [pass.primaryFields, pass.secondaryFields, pass.auxiliaryFields];
        fieldArrays.forEach(fieldArray => {
          fieldArray.forEach(field => {
            field.value = get({ data: passPayload }, field.key) ?? field.value;
          });
        });

        // Generate the stream .pkpass file stream
        const passName = 'sample-pass';
        logger.info(`Generating pkpass file: ${passName}`);

        const stream = pass.generate();
        res.set({
          'Content-type': 'application/vnd.apple.pkpass',
          'Content-disposition': `attachment; filename=${passName}.pkpass`,
        });
        stream.pipe(res);
      },
    }),
    makeHandler({
      route: '/pass/templates/ios',
      method: 'GET',
      description: markdown`
        List all available Apple Wallet Pass templates in the application. This could be
        useful to find a template with dynamic identifier.
      `,
      handle: async (_1, _2, { res, logger }) => {
        logger.debug('Return predefined iOS Wallet Pass templates');
        await refreshPassTemplateCache(logger);

        const iosPassTemplates = await passTemplateCache.getAll();
        const results = iosPassTemplates.map(template => ({
          templateId: template.templateId,
          description: template.passJson.description,
        }));
        res.send(results);
      },
    }),
  ];
});
