import { inflate } from 'pako';
import { Logger, threadP } from '@navch/common';

export type DecodeResult = {
  subject: Record<string, unknown>;
  payload: unknown; // decoded payload
};

const patterns = {
  hcert: {
    pattern: '^HC1:?(.+)$',
    decoder: hcertDecode,
  },
  nzcp: {
    pattern: '^NZCP:/1/(.+)$',
    decoder: nzcpDecode,
  },
};

export async function decode(input: string, logger: Logger): Promise<DecodeResult> {
  for (const { pattern, decoder } of Object.values(patterns)) {
    const matches = input.match(pattern);
    if (matches) {
      return await decoder(matches[1], logger);
    }
  }
  return { subject: {}, payload: input };
}

// Base45 > Zlib > COSE > CBOR > JSON
//
// https://github.com/mozq/dencode-web
// https://github.com/ehn-dcc-development/hcert-spec
// https://github.com/ehn-dcc-development/ehn-sign-verify-javascript-trivial
async function hcertDecode(input: string, logger: Logger) {
  logger.debug('Decoding HCERT payload', { input });
  const cbor = require('cbor');
  const base45 = require('base45-js');

  return await threadP(
    input,
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
    async buffer => {
      const coseData = cbor.decode(buffer);
      const cborData = cbor.decode(coseData.value[2]);
      const subject = Object.fromEntries(cborData.get(-260))[1];
      return { subject, payload: Object.fromEntries(cborData) };
    }
  ).catch(err => {
    logger.error('Failed to decode HCERT input', { err });
    throw new Error(`Invalid HCERT: ${err}`);
  });
}

// Base32 > Zlib > COSE > CBOR > JSON
//
// https://mattrglobal.github.io/nzcp/qvnNK89kiJRoEindxA3U
async function nzcpDecode(input: string, logger: Logger) {
  logger.debug('Decoding NZCP payload', { input });
  const cbor = require('cbor');
  const base32 = require('hi-base32');

  return await threadP(
    input,
    // Base45 to COSE
    async data => {
      return base32.decode.asBytes(data);
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
    // COSE to CBOR to JSON-LD
    async buffer => {
      const coseData = cbor.decode(buffer);
      const cborData = cbor.decode(coseData.value[2]);
      // https://w3c.github.io/vc-data-model/
      const subject = cborData.get('vc')['credentialSubject'];
      return { subject, payload: Object.fromEntries(cborData) };
    }
  ).catch(err => {
    logger.error('Failed to decode NZCP input', { err });
    throw new Error(`Invalid HCERT: ${err}`);
  });
}
