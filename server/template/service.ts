import * as t from 'io-ts';
import path from 'path';
import fs from 'fs-extra';
import memoize from 'memoizee';
import forEach from 'lodash/forEach';
import { ZipFile } from 'yazl';

import { Logger, MaybePromise, NotFoundError, isNotNullish } from '@navch/common';
import { validate } from '@navch/codec';

import { TemplateRecord } from './types';

/**
 * Function that loads the predefined template from local file system.
 *
 * It is recommended to cache the prepared PassModel in memory to be reused by multiple
 * requests to reduce the overhead of hitting the filesystem.
 */
type GetLocalTemplateOptions<A, O> = {
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

/**
 * Returns an abstract template manager that caches the loaded template in memory.
 */
type TemplateCacheOptions<A> = {
  readonly fetchTemplates: (logger: Logger) => MaybePromise<A[]>;
};
export function buildTemplateCache<A extends TemplateRecord>(options: TemplateCacheOptions<A>) {
  const { fetchTemplates } = options;

  const fetchTemplatesCached = memoize(fetchTemplates, {
    promise: true,
    normalizer: () => 'the-one',
  });

  return {
    async clear(): Promise<void> {
      return fetchTemplatesCached.clear();
    },
    async getAll(logger: Logger): Promise<A[]> {
      return await fetchTemplatesCached(logger);
    },
    async findById(logger: Logger, templateId: string): Promise<A> {
      const templates = await fetchTemplatesCached(logger);
      const result = templates.find(template => template.id === templateId);
      if (!result) {
        throw new NotFoundError(`No template found with ID "${templateId}"`);
      }
      return result;
    },
  };
}

/**
 * Bundles the sandbox specific template definitions to a ZIP file.
 */
type CreateTemplateZipFileOptions = {
  /**
   * A flat dictionary keyed by file path. Parent directories will be created for
   * nested file paths, such as "parent/file.txt".
   */
  readonly entries: Readonly<Record<string, Buffer>>;
};
export function createZipFile(options: CreateTemplateZipFileOptions) {
  const { entries } = options;
  const zipFile = new ZipFile();

  forEach(entries, (buffer, metadataPath) => {
    zipFile.addBuffer(buffer, metadataPath);
  });
  zipFile.end();

  return zipFile.outputStream;
}
