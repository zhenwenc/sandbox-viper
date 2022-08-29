import * as t from '@navch/codec';
import { makeHandler, makeHandlers } from '@navch/http';

import { decode } from '../decoder/service';
import { Decoder } from './types';

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
