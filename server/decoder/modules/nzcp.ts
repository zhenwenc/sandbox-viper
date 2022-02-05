import { inflate } from 'pako';
import { stringify } from 'uuid';

import { Logger, threadP } from '@navch/common';

import { Decoder, DecodeResult } from '../types';

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
  // https://mattrglobal.github.io/nzcp/qvnNK89kiJRoEindxA3U
  async decode(input: string): Promise<DecodeResult> {
    this.logger.debug('Decoding NZCP payload', { input });
    const cbor = require('cbor');
    const base32 = require('hi-base32');

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
        // const subject = cborData.get('vc')['credentialSubject'];
        const data = cborData.get('vc');
        const meta = {
          iss: cborData.get(1) * 1000,
          iat: cborData.get(5) * 1000, // Issued At
          exp: cborData.get(4) * 1000, // Expiration Time
          cti: stringify(cborData.get(7)), // CWT ID
          jti: 'urn:uuid:' + stringify(cborData.get(7)), // JTI ID
          // ext: {
          //   name: [subject.givenName, subject.familyName].filter(Boolean).join(' '),
          //   dob: formatISO(new Date(subject.dob)),
          //   iat: formatISO(cborData.get(5) * 1000), // Issued At
          //   exp: formatISO(cborData.get(4) * 1000), // Expiration Time
          // },
        };
        return { raw: Object.fromEntries(cborData), data, meta };
      }
    ).catch(err => {
      this.logger.error('Failed to decode NZCP input', { err });
      throw new Error(`Invalid HCERT: ${err}`);
    });
  }
}
