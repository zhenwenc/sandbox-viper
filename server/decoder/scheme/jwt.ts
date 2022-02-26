import { decodeJwt, decodeProtectedHeader } from 'jose';

import { Logger } from '@navch/common';

import { Decoder, DecodeResult } from '../types';

export class JWTDecoder implements Decoder {
  constructor(readonly logger: Logger) {}

  public isMatch(input: string): boolean {
    try {
      // check if it conform to JWT format
      return !!decodeProtectedHeader(input);
    } catch (err) {
      return false;
    }
  }

  async decode(input: string): Promise<DecodeResult> {
    this.logger.debug('Decoding JWT payload', { input });

    try {
      const data = decodeJwt(input);
      const meta = {
        iss: data.iss,
        sub: data.sub,
        aud: data.aud,
        jti: data.jti,
        nbf: data.nbf,
        exp: data.exp,
        iat: data.iat,
      };
      return { raw: data, data, meta };
    } catch (err) {
      this.logger.error('Failed to decode JWT input', { err });
      throw new Error(`Invalid JWT payload: ${err}`);
    }
  }
}
