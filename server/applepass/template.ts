import mustache from 'mustache';
import parseDataURL from 'data-urls';
import { v4 as uuid } from 'uuid';
import { oneLineTrim as markdown } from 'common-tags';
import { createAbstractModel } from 'passkit-generator';

import { Logger, BadRequestError } from '@navch/common';
import { validate } from '@navch/codec';

import { ApplePassConfig } from '../config';
import {
  PassModel,
  PassTemplate,
  PassCredentials,
  PassTemplateDefinition,
  isPassModelBundle,
  getLocalModels,
} from './model';

export type BuildPassTemplateOptions = {
  readonly logger: Logger;
  readonly config: ApplePassConfig;
};
export async function buildPassTemplates(options: BuildPassTemplateOptions): Promise<PassTemplate[]> {
  const { logger, config } = options;
  const { certificates, teamIdentifier, passTypeIdentifier, bundlesPath } = config;

  /**
   * The initial overrides for the PassModel so that we don't need to inject
   * the configurations into each involved handlers.
   *
   * These values can be overridden per-request via the `abstractMissingData`
   * argument of the `createPass` function.
   */
  const overrides = { teamIdentifier, passTypeIdentifier };

  /**
   * Load the packaged PassModels if there is any.
   */
  const passBundles = await getLocalModels(bundlesPath, logger);

  const promises = passBundles.map(async model => {
    if (model['pass.json'] === undefined) {
      throw new Error('Pass bundle must contain "pass.json"');
    }
    const abstractModel = isPassModelBundle(model)
      ? await createAbstractModel({ model, certificates, overrides })
      : await createAbstractModel({ model: model.modelDir, certificates, overrides });

    const passJson = validate(JSON.parse(model['pass.json'].toString()), PassModel);
    if (!passJson.serialNumber) {
      const message = markdown`
        Missing the required "serialNumber" key in "pass.json" file for {{ template }}.
        We use this value to uniquely identifies each template within the application.
        A random UUID will be generated for this template.
      `;
      logger.warn(mustache.render(message, { template: passJson.description }));
    }
    const templateId = passJson.serialNumber ?? uuid();

    return { templateId, model: passJson, abstractModel };
  });
  return await Promise.all(promises);
}

export type BuildDynamicTemplateOptions = {
  readonly definition: PassTemplateDefinition;
  readonly credentials: PassCredentials;
};
export async function buildDynamicTemplate(options: BuildDynamicTemplateOptions): Promise<PassTemplate> {
  const { credentials, definition } = options;
  const { model, images } = definition;
  const { certificates, teamIdentifier, passTypeIdentifier } = credentials;

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

  const template = {
    'pass.json': Buffer.from(JSON.stringify(model)),
  };

  /**
   * Load each defined image into the pass bundle.
   */
  Object.entries(images).forEach(([kind, { url }]) => {
    const parsed = parseImageDataURL(url);
    template[`${kind}.png`] = Buffer.from(parsed.body);
  });

  const abstractModel = await createAbstractModel({
    model: template,
    certificates,
    overrides: { teamIdentifier, passTypeIdentifier },
  });
  return { templateId: uuid(), model, abstractModel };
}
