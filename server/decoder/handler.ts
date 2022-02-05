import * as t from 'io-ts';

import { makeHandler, makeHandlers } from '@navch/http';

import { Decoder } from './types';
import { decode } from '../decoder/service';

export type Options = {
  readonly decoders: Decoder[];
};

export const buildDecoderHandlers = makeHandlers(({ decoders }: Options) => {
  return [
    makeHandler({
      route: '/',
      method: 'GET',
      input: { query: t.type({ barcode: t.string }) },
      handle: async (_1, { barcode }, { logger }) => {
        logger.info('Decode barcode payload', { barcode });
        return await decode(decoders, barcode);
      },
    }),
    makeHandler({
      route: '/',
      method: 'POST',
      input: { body: t.type({ barcode: t.string }) },
      handle: async (_1, { barcode }, { logger }) => {
        logger.info('Decode barcode payload', { barcode });
        return await decode(decoders, barcode);
      },
    }),
  ];
});
