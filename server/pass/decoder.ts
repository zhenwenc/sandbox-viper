import { inflate } from 'pako';
import { Logger, threadP } from '@navch/common';

export function inferDecoder(input: string) {
  if (/^HC1.+/.test(input)) {
    return hcertDecode;
  }
  throw new Error('No match decoder found for input');
}

// Zlib to COSE to CBOR to JSON
//
// https://github.com/mozq/dencode-web
// https://github.com/ehn-dcc-development/hcert-spec
// https://github.com/ehn-dcc-development/ehn-sign-verify-javascript-trivial
export async function hcertDecode(input: string, logger: Logger) {
  const cbor = require('cbor');
  const base45 = require('base45-js');

  return await threadP(
    input,
    // Base45 to COSE
    async data => {
      if (data.startsWith('HC1')) {
        data = data.substring(3);
        if (data.startsWith(':')) {
          data = data.substring(1);
        }
      }
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
      return Object.fromEntries(cborData.get(-260))[1];
    }
  ).catch(err => {
    logger.error('Failed to decode HCERT input', { err });
    throw new Error(`Invalid HCERT: ${err}`);
  });
}
