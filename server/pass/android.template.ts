import * as t from 'io-ts';
import fs from 'fs-extra';
import path from 'path';

import { Logger, isNotNullish } from '@navch/common';
import { validate } from '@navch/codec';

import { WalletClassType, WalletClass, WalletObjectType, WalletObject } from './android.model';

// https://developers.google.com/pay/passes/rest/v1/offerclass
export type PassTemplate = t.TypeOf<typeof PassTemplate>;
export const PassTemplate = t.type({
  templateId: t.string,
  description: t.string,
  classType: t.union([WalletClassType, t.undefined]),
  classTemplate: t.union([WalletClass, t.undefined]),
  objectType: WalletObjectType,
  objectTemplate: WalletObject,
});

export type BuildPassTemplatesOptions = {
  readonly logger: Logger;
};
export async function buildPassTemplates(options: BuildPassTemplatesOptions): Promise<PassTemplate[]> {
  const { logger } = options;

  /**
   * Load the packaged PassModels if there is any.
   */
  const rootDir = path.join(__dirname, '../../assets');

  const parseTemplateDir = (modelDir: string): PassTemplate => {
    try {
      const content = fs.readFileSync(path.join(modelDir, 'template.json'), 'utf8');
      return validate(JSON.parse(content), PassTemplate);
    } catch (err) {
      err.message = `Failed to parse Google Pay Pass template at ${modelDir}: ${err.message}`;
      throw err;
    }
  };

  const passBundles = fs.readdirSync(rootDir, { withFileTypes: true }).map(dirent => {
    if (dirent.name.endsWith('.paypass') && dirent.isDirectory()) {
      logger.debug(`Loading Google Pay Pass template: ${dirent.name}`);
      return parseTemplateDir(path.join(rootDir, dirent.name));
    }
    return undefined;
  });
  return passBundles.filter(isNotNullish);
}
