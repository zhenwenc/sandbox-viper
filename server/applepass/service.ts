import { v4 as uuid } from 'uuid';
import { createPass, Pass } from 'passkit-generator';

import { Logger } from '@navch/common';

import { resolveTemplateValue } from '../utils';
import { PassTemplate } from './model';

export type CreateWalletPassRequest = {
  readonly logger: Logger;
  readonly template: PassTemplate;
  readonly barcode: string;
  readonly payload: Record<string, unknown>;
};
export async function createWalletPass(req: CreateWalletPassRequest): Promise<Pass> {
  const { logger, template, payload, barcode } = req;

  const fieldValues = { data: payload };
  logger.debug('Generate iOS Wallet Pass with decoded payload', payload);

  const pass = await createPass(template.abstractModel, undefined, {
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
    },
  });

  // Adding some settings to be written inside pass.json
  if (template.model.barcode?.altText) {
    pass.barcodes({
      format: template.model.barcode?.format || 'PKBarcodeFormatQR',
      messageEncoding: template.model.barcode?.messageEncoding || 'iso-8859-1',
      message: barcode,
      altText: resolveTemplateValue(fieldValues, template.model.barcode.altText),
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
      field.value = resolveTemplateValue(fieldValues, field.value) ?? field.value;
    });
  });

  return pass;
}
