import * as t from 'io-ts';
import path from 'path';
import mustache from 'mustache';
import { v4 as uuid } from 'uuid';
import { oneLineTrim as markdown } from 'common-tags';
import { createAbstractModel, AbstractModel } from 'passkit-generator';

import { Logger } from '@navch/common';
import { validate } from '@navch/codec';

import { PassModel, PassModelCertificates, PassModelIdentifiers, getLocalModels } from './ios.model';

export type PassTemplate = t.TypeOf<typeof PassTemplate>;
export const PassTemplate = t.type({
  templateId: t.string,
  abstractModel: t.unknown as t.Type<AbstractModel>,
  passJson: PassModel,
});

export async function buildPassTemplates(logger: Logger): Promise<PassTemplate[]> {
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

  /**
   * The initial overrides for the PassModel so that we don't need to inject
   * the configurations into each involved handlers.
   *
   * These values can be overridden per-request via the `abstractMissingData`
   * argument of the `createPass` function.
   */
  const overrides = validate(
    {
      teamIdentifier: process.env.PASS_IOS_TEAM_ID,
      passTypeIdentifier: process.env.PASS_IOS_PASS_TYPE_ID,
    },
    PassModelIdentifiers
  );

  /**
   * Load the packaged PassModels if there is any.
   */
  const passBundles = await getLocalModels(path.join(__dirname, '../../assets'), logger);

  const promises = passBundles.map(async model => {
    if (model['pass.json'] === undefined) {
      throw new Error('Pass bundle must contain "pass.json"');
    }
    const passJson = validate(JSON.parse(model['pass.json'].toString()), PassModel);
    const abstractModel = await createAbstractModel({ model, certificates, overrides });

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

export type PassTemplateCache = ReturnType<typeof buildPassTemplateCache>;
export function buildPassTemplateCache() {
  const store = new Map<string, { data: PassTemplate; exp: number }>();
  const prune = () => {
    store.forEach(({ exp }, key) => {
      if (Date.now() < exp) return;
      store.delete(key);
    });
  };
  return {
    async setItem(value: PassTemplate, exp = 86400 * 1000): Promise<void> {
      store.set(value.templateId, {
        data: value,
        exp: Date.now() + exp * 1000,
      });
    },
    async getItem(key: string): Promise<PassTemplate | undefined> {
      prune();
      const record = store.get(key);
      return record?.data;
    },
    async getAll(): Promise<PassTemplate[]> {
      return Array.from(store.values()).map(value => value.data);
    },
  };
}
