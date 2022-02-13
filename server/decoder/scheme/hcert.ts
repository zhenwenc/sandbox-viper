import got from 'got';
import cbor from 'cbor';
import memoize from 'memoizee';
import { path } from 'ramda';
import { map, fromPairs } from 'lodash';
import { inflate } from 'pako';
import { Schema, Validator, ValidatorResult, RewriteFunction } from 'jsonschema';

import { Logger, BadRequestError, invariant, threadP } from '@navch/common';

import { Decoder, DecodeResult, PayloadRecord } from '../types';

/**
 * According to the HCERT spec, the QR code content SHALL be prefixed by the Context
 * Identifier string "HC1:".
 *
 * https://github.com/ehn-dcc-development/hcert-spec/blob/main/hcert_spec.md
 */
const HCERT_PATTERN = '^HC1:?(.+)$';

const DCC_JSON_SCHEMA_REPO = 'https://raw.githubusercontent.com/ehn-dcc-development/ehn-dcc-schema';
const DCC_JSON_SCHEMA_FILE = 'DCC.combined-schema.json';

const DCC_VALUESETS_REPO = 'https://raw.githubusercontent.com/ehn-dcc-development/ehn-dcc-valuesets';
const DCC_VALUESETS = {
  'valuesets/country-2-codes.json': 'country-2-codes.json',
  'valuesets/disease-agent-targeted.json': 'disease-agent-targeted.json',
  'valuesets/test-manf.json': 'test-manf.json',
  'valuesets/test-result.json': 'test-result.json',
  'valuesets/test-type.json': 'test-type.json',
  'valuesets/vaccine-mah-manf.json': 'vaccine-mah-manf.json',
  'valuesets/vaccine-medicinal-product.json': 'vaccine-medicinal-product.json',
  'valuesets/vaccine-prophylaxis.json': 'vaccine-prophylaxis.json',
};

const schemaCacheOptions = {
  max: 10,
  maxAge: 3600000, // 1 hour
  promise: true, // remove rejected result
  normalizer: ([_, version]: [Logger, string | undefined]) => version ?? 'default',
};

async function fetchJsonSchema(logger: Logger, version?: string) {
  const branch = version ? `release/${version}` : 'main';
  const uri = `${DCC_JSON_SCHEMA_REPO}/${branch}/${DCC_JSON_SCHEMA_FILE}`;

  const request = got(uri).json<Schema>();
  await request.catch(err => {
    logger.error('Failed to download DCC JSON schema', err);
  });
  return await request;
}

async function fetchValuesets(logger: Logger, version?: string) {
  const branch = version ? `release/${version}` : 'main';

  const pairs = map(DCC_VALUESETS, async (filePath, key) => {
    const uri = `${DCC_VALUESETS_REPO}/${branch}/${filePath}`;

    const request = got(uri).json<Schema>();
    await request.catch(err => {
      logger.error('Failed to download DCC JSON Schema Valueset', err);
    });
    return [key, await request] as [string, string];
  });
  return fromPairs(await Promise.all(pairs));
}

export class HCERTDecoder implements Decoder {
  constructor(readonly logger: Logger) {
    this.decode = this.decode.bind(this);
    this.validate = this.validate.bind(this);
    this.validateOrThrow = this.validateOrThrow.bind(this);
  }

  readonly validator = new Validator();

  readonly fetchJsonSchemaCached = memoize(fetchJsonSchema, schemaCacheOptions);
  readonly fetchValuesetsCached = memoize(fetchValuesets, schemaCacheOptions);

  public isMatch(input: string): boolean {
    return Boolean(input.match(HCERT_PATTERN));
  }

  async validate(record: PayloadRecord): Promise<ValidatorResult> {
    const version = record?.ver as string | undefined;

    const schema = await this.fetchJsonSchemaCached(this.logger, version);
    const valuesets = await this.fetchValuesetsCached(this.logger);

    const rewrite: RewriteFunction = (field, fieldSchema) => {
      const valuesetKey = fieldSchema['valueset-uri'];
      if (!valuesetKey) {
        return field;
      }

      const valueset = valuesets[valuesetKey];
      invariant(valueset, `No valueset found with [${valuesetKey}]`);

      const value = path(['valueSetValues', field], valueset);
      invariant(valueset, `No value found from [${valuesetKey}] with key [${field}]`);

      return value;
    };
    return this.validator.validate(record, schema, { rewrite });
  }

  async validateOrThrow<T extends PayloadRecord>(record: PayloadRecord): Promise<T> {
    const result = await this.validate(record);

    if (!result.valid) {
      const errors = result.errors.map(err => err.toString());
      throw new BadRequestError(`Invalid DCC payload: ${JSON.stringify(errors)}`);
    }
    return result.instance as T;
  }

  // Base45 > Zlib > COSE > CBOR > JSON
  //
  // https://github.com/mozq/dencode-web
  // https://github.com/ehn-dcc-development/hcert-spec
  // https://github.com/ehn-dcc-development/ehn-sign-verify-javascript-trivial
  async decode(input: string): Promise<DecodeResult> {
    this.logger.debug('Decoding HCERT payload', { input });

    const base45 = require('base45-js'); // missing type definitions

    const payload = input.match(HCERT_PATTERN)?.[1];
    if (!payload) {
      throw new Error(`Payload does not confirm to HCERT format`);
    }

    return await threadP(
      payload,
      // Base45 to COSE
      async data => {
        return base45.decode(data);
      },
      // Decompress COSE
      async (buffer: Buffer) => {
        // Zlib magic headers:
        //
        // 78 01 - No Compression/low
        // 78 9C - Default Compression
        // 78 DA - Best Compression
        //
        if (buffer[0] == 0x78) {
          return inflate(buffer);
        }
        return Uint8Array.from(buffer);
      },
      // COSE to CBOR to JSON
      //
      // https://github.com/ehn-dcc-development/hcert-spec/blob/main/hcert_spec.md#331-cwt-structure-overview
      async buffer => {
        const coseData = cbor.decode(buffer);
        const cborData = cbor.decode(coseData.value[2]);
        const hcert = Object.fromEntries(cborData.get(-260))[1];
        await this.validateOrThrow(hcert);

        const meta = {
          iss: cborData.get(1), // Issuer, ISO 3166-1 alpha-2
          iat: cborData.get(6) * 1000, // Issued At
          exp: cborData.get(4) * 1000, // Expiration Time
          kind: hcert.v ? 'Vaccination' : hcert.t ? 'Test' : 'Recovery',
        };
        return { raw: Object.fromEntries(cborData), data: hcert, meta };
      }
    ).catch(err => {
      this.logger.error('Failed to decode HCERT input', { err });
      throw new Error(`Invalid HCERT payload: ${err}`);
    });
  }
}
