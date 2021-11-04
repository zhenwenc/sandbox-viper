import * as t from 'io-ts';
import fs from 'fs-extra';
import path from 'path';

import { Logger, isNotNullish } from '@navch/common';
import { validate } from '@navch/codec';

import { GooglePayPassConfig } from '../config';
import { WalletClassType, WalletClass, WalletObjectType, WalletObject } from './model';

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
  readonly config: GooglePayPassConfig;
};
export async function buildPassTemplates(options: BuildPassTemplatesOptions): Promise<PassTemplate[]> {
  const { logger, config } = options;
  const { bundlesPath } = config;

  const parseTemplateDir = (modelDir: string): PassTemplate => {
    try {
      const content = fs.readFileSync(path.join(modelDir, 'template.json'), 'utf8');
      return validate(JSON.parse(content), PassTemplate);
    } catch (err) {
      err.message = `Failed to parse Google Pay Pass template at ${modelDir}: ${err.message}`;
      throw err;
    }
  };

  /**
   * Load the packaged PassModels if there is any.
   */
  const passBundles = fs.readdirSync(bundlesPath, { withFileTypes: true }).map(dirent => {
    if (dirent.name.endsWith('.paypass') && dirent.isDirectory()) {
      logger.debug(`Loading Google Pay Pass template: ${dirent.name}`);
      return parseTemplateDir(path.join(bundlesPath, dirent.name));
    }
    return undefined;
  });
  return passBundles.filter(isNotNullish);
}
