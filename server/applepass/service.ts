import parseDataURL from 'data-urls';
import { v4 as uuid } from 'uuid';
import { createPass, Pass } from 'passkit-generator';

import { Logger, BadRequestError } from '@navch/common';

import { resolveTemplateValue } from '../template/renderer';
import { PassTemplateDefinition, PassCredentials } from './types';

const parseImageDataURL = (url: string) => {
  // NOTE: The parser function does not raise error when encountered invalid URL but
  // returns `null`, unless for invalid data type, such as parsing a non-string value.
  const image = parseDataURL(url);
  if (!image) {
    throw new BadRequestError(`Invalid image URL: ${url}`);
  }
  if (image.mimeType.essence !== 'image/png') {
    throw new BadRequestError('Only PNG image is supported.');
  }
  return image;
};

export type CreateWalletPassRequest = {
  readonly logger: Logger;
  readonly template: PassTemplateDefinition;
  readonly credentials: PassCredentials;
  readonly barcode: string;
  readonly payload: Record<string, unknown>;
};
export async function createWalletPass(req: CreateWalletPassRequest): Promise<Pass> {
  const { logger, template, credentials, payload, barcode } = req;
  const { model, images } = template;
  const { certificates, teamIdentifier, passTypeIdentifier } = credentials;
  logger.debug('Generate Apple Wallet Pass with decoded payload', payload);

  /**
   * Load each defined image into the pass bundle.
   */
  const assets = Object.entries(images).reduce((accu, [kind, { url }]) => {
    const parsed = parseImageDataURL(url);
    return { ...accu, [`${kind}.png`]: Buffer.from(parsed.body) };
  }, {});

  const pass = await createPass({
    model: {
      ...assets,
      'pass.json': Buffer.from(JSON.stringify(model)),
    },
    certificates,
    overrides: {
      teamIdentifier,
      passTypeIdentifier,
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
    },
  });

  // Adding some settings to be written inside pass.json
  if (template.model.barcode?.altText) {
    pass.barcodes({
      format: template.model.barcode?.format || 'PKBarcodeFormatQR',
      messageEncoding: template.model.barcode?.messageEncoding || 'iso-8859-1',
      message: barcode,
      altText: resolveTemplateValue(payload, template.model.barcode.altText),
    });
  } else {
    pass.barcodes({
      format: template.model.barcode?.format || 'PKBarcodeFormatQR',
      messageEncoding: template.model.barcode?.messageEncoding || 'iso-8859-1',
      message: barcode,
    });
  }

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
  const fieldArrays = [
    pass.headerFields,
    pass.primaryFields,
    pass.secondaryFields,
    pass.auxiliaryFields,
    pass.backFields,
  ];
  fieldArrays.forEach(fieldArray => {
    fieldArray.forEach(field => {
      field.value = resolveTemplateValue(payload, field.value) ?? field.value;
    });
  });

  return pass;
}
