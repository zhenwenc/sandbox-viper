import parseDataURL from 'data-urls';
import cloneDeep from 'lodash/cloneDeep';
import cloneDeepWith from 'lodash/cloneDeepWith';
import flatten from 'lodash/flatten';
import { PKPass } from 'passkit-generator';
import { PassProps as PassPropsSchema } from 'passkit-generator/lib/schemas';
import * as R from 'ramda';
import { v4 as uuid } from 'uuid';

import { Logger, BadRequestError, isNotNullish } from '@navch/common';

import { resolveTemplateValue } from '../template/renderer';
import { createZipFile } from '../template/service';
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
export async function createWalletPass(req: CreateWalletPassRequest): Promise<PKPass> {
  const { logger, template, credentials, payload, barcode } = req;
  const { model, images, localizations } = template;
  const { certificates, teamIdentifier, passTypeIdentifier } = credentials;
  logger.debug('Generate Apple Wallet Pass with decoded payload', payload);

  const templateData = R.mergeDeepRight(payload, { barcode });

  //
  // TODO Is there a better way to capture the validation failures?
  //
  // The `passkit-generator` library is designed not to throw pass resource validation
  // errors. This would results in subsequent operations to fail with unrelated context.
  //
  // For example, when the `PKPass` is partially created, the annoying "undefined" error
  // will throw when accessing properties like `PKPass#headerFields`.
  //
  const validationResult = PassPropsSchema.validate(R.omit(['barcode'], model));
  if (validationResult.error) {
    throw new BadRequestError(validationResult.error);
  }

  //
  // Hex color codes are no longer supported since `passkit-generator@3.x`, use CSS-style
  // RGB triple instead, such as rgb(23, 187, 82).
  //
  // @see ${https://developer.apple.com/documentation/walletpasses/pass}
  //
  const pass = new PKPass(
    {
      'pass.json': Buffer.from(JSON.stringify(model)),
    },
    {
      wwdr: certificates.wwdr,
      signerCert: certificates.signerCert,
      signerKey: certificates.signerKey,
      signerKeyPassphrase: certificates.signerKeyPassphrase,
    },
    {
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
       *
       * @see {@link https://developer.apple.com/documentation/walletpasses}
       */
      serialNumber: uuid(),
    }
  );

  //
  // Add each defined image into the pass bundle.
  //
  Object.entries(images).forEach(([kind, { url }]) => {
    const parsed = parseImageDataURL(url);
    pass.addBuffer(`${kind}.png`, Buffer.from(parsed.body));
  });

  //
  // Add each defined localization settings into the pass bundle.
  //
  Object.entries(localizations ?? {}).forEach(([lang, localized]) => {
    // Add location-specific image files to the localization directory
    Object.entries(localized.images ?? []).forEach(([kind, { url }]) => {
      const parsed = parseImageDataURL(url);
      pass.addBuffer(`${lang}.lproj/${kind}.png`, Buffer.from(parsed.body));
    });

    // Add translation strings to the localization directory
    const translations = cloneDeepWith(cloneDeep(localized.strings), key => {
      if (typeof key !== 'string') return undefined;
      return resolveTemplateValue(templateData, key);
    });
    pass.localize(lang, translations);
  });

  //
  // Add extra settings to be written inside pass.json
  //
  if (template.model.barcode?.altText) {
    pass.setBarcodes({
      format: template.model.barcode?.format || 'PKBarcodeFormatQR',
      messageEncoding: template.model.barcode?.messageEncoding || 'iso-8859-1',
      message: barcode,
      altText: resolveTemplateValue(templateData, template.model.barcode.altText),
    });
  } else {
    pass.setBarcodes({
      format: template.model.barcode?.format || 'PKBarcodeFormatQR',
      messageEncoding: template.model.barcode?.messageEncoding || 'iso-8859-1',
      message: barcode,
    });
  }

  //
  // TODO Why the library's `FieldsArray#splice` function doesn't work?
  //      It will results in an invalid Pass bundle.
  //
  // https://github.com/zhenwenc/sandbox-viper/issues/1
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
      if (typeof field.value === 'string') {
        field.value = resolveTemplateValue(templateData, field.value) ?? field.value;
      }
    });
  });

  return pass;
}

export type CreateTemplateZipRequest = {
  readonly logger: Logger;
  readonly template: PassTemplateDefinition;
  readonly metadataFileName: string | undefined;
};
export async function createTemplateZip(req: CreateTemplateZipRequest): Promise<NodeJS.ReadableStream> {
  const { logger, template, metadataFileName } = req;
  logger.debug('Convert Apple Wallet Pass template to zip file');

  const metadata = {
    name: template.name,
  };

  const mapResources = <T extends Record<string, any>>(
    values: T | undefined,
    func: (key: keyof T, value: NonNullable<T[keyof T]>) => Record<string, Buffer>
  ): Record<string, Buffer> => {
    const pairs = Object.entries(values ?? {}).map(([key, value]) => {
      if (value == null) return undefined;
      return R.toPairs(func(key, value)).filter(value => isNotNullish(value));
    });
    return R.fromPairs(flatten(pairs.filter(isNotNullish)));
  };

  const imageFiles = mapResources(template.images, (kind, { url }) => {
    const parsed = parseImageDataURL(url);
    return { [`${kind}.png`]: Buffer.from(parsed.body) };
  });

  const localizationFiles = mapResources(template.localizations, (lang, localized) => {
    // Add location-specific image files to the localization directory
    const images = mapResources(localized.images, (kind, { url }) => {
      const parsed = parseImageDataURL(url);
      return { [`${lang}.lproj/${kind}.png`]: Buffer.from(parsed.body) };
    });

    // Add translation strings to the localization directory
    const strings = R.toPairs(localized.strings ?? {})
      .map(pair => pair.map(str => `"${str}"`).join('='))
      .join('\n');

    return {
      ...images,
      ...(!R.isEmpty(strings) && { [`${lang}.lproj/pass.strings`]: Buffer.from(strings) }),
    };
  });

  return createZipFile({
    entries: {
      'pass.json': Buffer.from(JSON.stringify(template.model)),
      ...(!R.isEmpty(imageFiles) && imageFiles),
      ...(!R.isEmpty(localizationFiles) && localizationFiles),
      ...(metadataFileName && {
        [metadataFileName]: Buffer.from(JSON.stringify(metadata)),
      }),
    },
  });
}
