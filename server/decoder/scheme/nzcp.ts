import cbor from 'cbor';
import base32 from 'hi-base32';
import { inflate } from 'pako';
import { stringify } from 'uuid';

import { Logger, threadP } from '@navch/common';

import { Decoder, DecodeResult } from '../types';

/**
 * According to the NZCP spec, the QR code content SHALL be prefixed by the Context
 * Identifier string "NZCP:/", we only supports version 1 for now.
 *
 * https://nzcp.covid19.health.nz
 */
const NZCP_PATTERN = '^NZCP:/1/(.+)$';

export class NZCPDecoder implements Decoder {
  constructor(readonly logger: Logger) {
    this.decode = this.decode.bind(this);
  }

  public isMatch(input: string): boolean {
    return Boolean(input.match(NZCP_PATTERN));
  }

  // Base32 > Zlib > COSE > CBOR > JSON
  //
  // https://nzcp.covid19.health.nz
  async decode(input: string): Promise<DecodeResult> {
    this.logger.debug('Decoding NZCP payload', { input });

    const payload = input.match(NZCP_PATTERN)?.[1];
    if (!payload) {
      throw new Error(`Payload does not confirm to NZCP format`);
    }

    return await threadP(
      payload,
      // Base45 to COSE
      async data => {
        return base32.decode.asBytes(data);
      },
      // Decompress COSE
      async (buffer: number[]) => {
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
        const data = cborData.get('vc');
        const meta = {
          iss: cborData.get(1) * 1000,
          iat: cborData.get(5) * 1000, // Issued At
          exp: cborData.get(4) * 1000, // Expiration Time
          cti: stringify(cborData.get(7)), // CWT ID
          jti: 'urn:uuid:' + stringify(cborData.get(7)), // JTI ID
        };
        return { raw: Object.fromEntries(cborData), data, meta };
      }
    ).catch(err => {
      this.logger.error('Failed to decode NZCP input', { err });
      throw new Error(`Invalid NZCP payload: ${err}`);
    });
  }
}
