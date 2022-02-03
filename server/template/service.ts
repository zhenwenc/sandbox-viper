import * as t from 'io-ts';
import path from 'path';
import fs from 'fs-extra';

import { Logger, isNotNullish } from '@navch/common';
import { validate } from '@navch/codec';

import { TemplateRecord } from './types';

/**
 * Function that loads the predefined template from local file system.
 *
 * It is recommended to cache the prepared PassModel in memory to be reused by multiple
 * requests to reduce the overhead of hitting the filesystem.
 */
export type GetLocalTemplateOptions<A, O> = {
  readonly logger: Logger;
  readonly rootDir: string;
  readonly schema: t.Type<A, O>;
};
export async function getLocalTemplates<A extends TemplateRecord, O = A>(
  options: GetLocalTemplateOptions<A, O>
): Promise<A[]> {
  const { logger, rootDir, schema } = options;
  const promises = fs.readdirSync(rootDir, { withFileTypes: true }).map(async dirent => {
    if (dirent.name.endsWith('.json') && dirent.isFile()) {
      logger.debug(`Loading local pass template: ${dirent.name}`);
      const content = await fs.readFile(path.join(rootDir, dirent.name), 'utf8');
      return validate(JSON.parse(content), schema);
    }
    return Promise.resolve(undefined);
  });
  return (await Promise.all(promises)).filter(isNotNullish);
}
