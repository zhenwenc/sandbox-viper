import * as t from 'io-ts';
import path from 'path';
import mustache from 'mustache';
import { get } from 'lodash';
import { oneLineTrim as markdown } from 'common-tags';
import { createPass, createAbstractModel, AbstractModel } from 'passkit-generator';

import { Logger, NotFoundError } from '@navch/common';
import { validate } from '@navch/codec';
import { makeHandler, makeRouter } from '@navch/express';

import { PassModel, PassModelCertificates, PassModelIdentifiers, getLocalModels } from './ios.model';
import { hcertDecode } from './decoder';

export const PassTemplate = t.type({
  templateId: t.string,
  abstractModel: t.unknown as t.Type<AbstractModel>,
  passJson: PassModel,
});

export type HandlerContext = t.TypeOf<typeof HandlerContext>;
export const HandlerContext = t.type({
  iosPassTemplates: t.array(PassTemplate),
});

export const createHandlerContext = async (logger: Logger): Promise<HandlerContext> => {
  /**
   * The certificates used for signing the generated wallet pass, which can
   * be either a path to the PEM-formatted certificate file, or the PEM text.
   *
   * We demonstrate the use case of configure via environment variables.
   */
  const certificates = validate(
    {
      wwdr: process.env.PASS_IOS_WWDR,
      signerCert: process.env.PASS_IOS_SIGNER_CERT,
      signerKey: {
        keyFile: process.env.PASS_IOS_SIGNER_KEY,
        passphrase: process.env.PASS_IOS_SIGNER_KEY_PASS,
      },
    },
    PassModelCertificates
  );

  const overrides = validate(
    {
      teamIdentifier: process.env.PASS_IOS_TEAM_ID,
      passTypeIdentifier: process.env.PASS_IOS_PASS_TYPE_ID,
    },
    PassModelIdentifiers
  );

  const iosPassBundles = await getLocalModels(path.join(__dirname, '../../assets'), logger);
  const promises = iosPassBundles.map(async model => {
    if (model['pass.json'] === undefined) {
      throw new Error('Pass bundle must contain "pass.json"');
    }
    const passJson = validate(JSON.parse(model['pass.json'].toString()), PassModel);
    const abstractModel = await createAbstractModel({ model, certificates, overrides });

    if (!passJson.serialNumber) {
      const message = markdown`
        Missing the required "serialNumber" key in "pass.json" file for {{ template }}.
        We use this value to uniquely identifies each template within the application.
      `;
      throw new Error(mustache.render(message, { template: passJson.description }));
    }
    const templateId = passJson.serialNumber;

    return { templateId, passJson, abstractModel };
  });

  return { iosPassTemplates: await Promise.all(promises) };
};

export const buildRouter = makeRouter(() => [
  makeHandler({
    route: '/pass/templates/ios',
    method: 'GET',
    context: HandlerContext,
    handle: async (_1, _2, { res, logger, iosPassTemplates }) => {
      logger.debug('Return predefined iOS Wallet Pass templates');

      const results = iosPassTemplates.map(template => ({
        templateId: template.templateId,
        description: template.passJson.description,
      }));
      res.send(results);
    },
  }),
  makeHandler({
    route: '/pass/ios',
    method: 'GET',
    input: {
      query: t.type({
        templateId: t.string,
        barcode: t.string,
        /**
         * The Pass templates are cached in memory during the application runtime.
         * You can enable this flag to force refreshing the templates for development
         * purposes. We only apply truthy on this value.
         */
        forceReload: t.union([t.string, t.undefined]),
      }),
    },
    context: HandlerContext,
    handle: async (_1, args, { req, res, logger, ...context }) => {
      logger.info('Generate iOS Wallet Pass with arguments', args);
      const { templateId, barcode, forceReload } = args;

      const iosPassTemplates = forceReload
        ? (await createHandlerContext(logger)).iosPassTemplates
        : context.iosPassTemplates;

      const template = iosPassTemplates.find(other => other.templateId === templateId);
      if (!template) {
        throw new NotFoundError(`No template found with ID "${templateId}"`);
      }
      logger.debug('Generate iOS Wallet Pass with template');

      const payload = await hcertDecode(barcode);
      logger.debug('Generate iOS Wallet Pass with decoded payload', payload);

      const pass = await createPass(template.abstractModel);

      // TODO Why the library doesn't support updating the serialNumber?
      //
      // The combination of pass type identifier and serial number is used throughout
      // PassKit to uniquely identify a pass. Two passes of the same type with the same
      // serial number are understood to be the same pass, even if other information
      // on them differs.

      // Adding some settings to be written inside pass.json
      pass.barcodes(barcode);

      // const foo = pass.primaryFields.pop();
      // pass.primaryFields.push(foo);

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
      // NOTE Yet another pitfall, the "value" attribute must be defined in each field,
      // or they won't be picked up by the `passkit-generator` library.
      //
      const fieldArrays = [pass.primaryFields, pass.secondaryFields, pass.auxiliaryFields];
      fieldArrays.forEach(fieldArray => {
        fieldArray.forEach(field => {
          field.value = get(payload, field.key) ?? field.value;
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
]);
