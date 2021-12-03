import * as t from 'io-ts';

import { makeHandler, makeHandlers } from '@navch/http';

import { decode } from '../decoder/service';

export const buildDecoderHandlers = makeHandlers(() => {
  return [
    makeHandler({
      route: '/',
      method: 'GET',
      input: { query: t.type({ barcode: t.string }) },
      handle: async (_1, { barcode }, { logger }) => {
        logger.info('Decode barcode payload', { barcode });
        return await decode(barcode, logger);
      },
    }),
    makeHandler({
      route: '/',
      method: 'POST',
      input: { body: t.type({ barcode: t.string }) },
      handle: async (_1, { barcode }, { logger }) => {
        logger.info('Decode barcode payload', { barcode });
        return await decode(barcode, logger);
      },
    }),
  ];
});
