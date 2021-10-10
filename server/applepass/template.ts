import * as t from 'io-ts';
import path from 'path';
import mustache from 'mustache';
import { v4 as uuid } from 'uuid';
import { oneLineTrim as markdown } from 'common-tags';
import { createAbstractModel, AbstractModel } from 'passkit-generator';

import { Logger } from '@navch/common';
import { validate } from '@navch/codec';

import { ApplePassConfig } from '../config';
import { PassModel, isPassModelBundle, getLocalModels } from './model';

export type PassTemplate = t.TypeOf<typeof PassTemplate>;
export const PassTemplate = t.type({
  templateId: t.string,
  abstractModel: t.unknown as t.Type<AbstractModel>,
  passJson: PassModel,
});

export type BuildPassTemplateOptions = {
  readonly logger: Logger;
  readonly config: ApplePassConfig;
};
export async function buildPassTemplates(options: BuildPassTemplateOptions): Promise<PassTemplate[]> {
  const { logger, config } = options;
  const { certificates, teamIdentifier, passTypeIdentifier } = config;

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
  const passBundles = await getLocalModels(path.join(__dirname, '../../assets'), logger);

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

    return { templateId, passJson, abstractModel };
  });

  return await Promise.all(promises);
}
