import cbor from 'cbor';

import { Logger, threadP } from '@navch/common';

import { Decoder, DecodeResult } from '../types';

export class MDocDeviceEngagementDecoder implements Decoder {
  static PATTERN = '^mdoc:?(.+)$';

  constructor(readonly logger: Logger) {
    this.decode = this.decode.bind(this);
  }

  public isMatch(input: string): boolean {
    return Boolean(input.match(MDocDeviceEngagementDecoder.PATTERN));
  }

  // Base64URL (RFC 4648) > CBOR > JSON
  //
  async decode(input: string): Promise<DecodeResult> {
    this.logger.debug('Decoding MDoc payload', { input });

    const payload = input.match(MDocDeviceEngagementDecoder.PATTERN)?.[1];
    if (!payload) {
      throw new Error(`Payload does not confirm to MDoc device engagement format`);
    }

    return await threadP(
      payload,
      // Base64URL to CBOR
      async data => {
        return Buffer.from(data, 'base64url');
      },
      // CBOR to JSON
      async buffer => {
        const cborData = cbor.decode(buffer);

        const security = cborData.get(1);
        const [cipherSuite, encodedDeviceKey] = security;

        const deviceKey = cbor.decode(encodedDeviceKey.value);
        const keyType = deviceKey.get(1);

        /// https://www.iana.org/assignments/cose/cose.xhtml#elliptic-curves
        const ecCurve = {
          1: 'P-256',
          2: 'P-348',
        }[deviceKey.get(-1)];

        const meta = {
          version: cborData.get(0), // string
          security: {
            keyType,
            cipherSuite,
            deviceKey: /* JWK */ {
              alg: 'EC',
              crv: ecCurve,
              x: Buffer.from(deviceKey.get(-2)).toString('base64'),
              y: Buffer.from(deviceKey.get(-3)).toString('base64'),
            },
          },
          // 1: nfc
          // 2: ble
          // 3: wifiAware
          deviceRetrievalMethods: cborData.get(2), // TODO: array?
        };

        const data = {};

        return { raw: Object.fromEntries(cborData), data, meta };
      }
    ).catch(err => {
      this.logger.error('Failed to decode MDoc device engagement input', { err });
      throw new Error(`Invalid MDoc device engagement payload: ${err}`);
    });
  }
}
