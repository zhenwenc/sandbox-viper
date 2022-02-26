import { Logger } from '@navch/common';

import { HCERTDecoder } from './scheme/hcert';
import { NZCPDecoder } from './scheme/nzcp';
import { JWTDecoder } from './scheme/jwt';
import { Decoder, DecodeResult } from './types';

export function buildDecoders(logger: Logger): Decoder[] {
  return [
    new HCERTDecoder(logger),
    new NZCPDecoder(logger),
    new JWTDecoder(logger), // must be the last for better performance
  ];
}

export async function decode(decoders: Decoder[], input: string): Promise<DecodeResult> {
  for (const decoder of decoders) {
    if (decoder.isMatch(input)) {
      return await decoder.decode(input);
    }
  }
  return { raw: {}, data: {}, meta: {} };
}
