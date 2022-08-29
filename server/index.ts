import Redis from 'ioredis';
import morgan from 'morgan';
import { compose, trim } from 'ramda';

import { Logger } from '@navch/common';
import { makeRouter, middlewares, setRequestContext } from '@navch/http';

import { buildApplePassHandlers } from './applepass/handler';
import { AppConfig } from './config';
import { buildDecoderHandlers } from './decoder/handler';
import { buildDecoders } from './decoder/service';
import { buildGooglePassHandlers } from './googlepass/handler';
import { buildInMemoryStorage, buildRedisStorage } from './storage';

export function buildHandler() {
  const config = new AppConfig();
  const logger = new Logger({ name: 'viper' });

  const decoders = buildDecoders(logger);

  const applStorage = config.redisURI
    ? buildRedisStorage(
        new Redis(config.redisURI, {
          keyPrefix: 'sandbox:viper:applepass:',
          showFriendlyErrorStack: true,
        })
      )
    : buildInMemoryStorage();

  const googStorage = config.redisURI
    ? buildRedisStorage(
        new Redis(config.redisURI, {
          keyPrefix: 'sandbox:viper:googlepass:',
          showFriendlyErrorStack: true,
        })
      )
    : buildInMemoryStorage();

  const requestLogger = morgan('dev', {
    stream: { write: compose(logger.debug, trim) },
  });

  const router = makeRouter();
  router.use(setRequestContext({ logger }));
  router.use(middlewares.fromCallback(requestLogger));
  router.use(middlewares.errorHandler({ logger, expose: true }));

  // -----------------------------------------------------------------------
  // TODO Launch services on demand
  //
  // This project is designed for demonstration purposes that you might only be
  // interested in some of the functionalities it provides. Therefore, we don't
  // enforce you to provide all environment variables to start with.

  const decoRouter = makeRouter(buildDecoderHandlers({ decoders }));
  const applRouter = makeRouter(buildApplePassHandlers({ config, storage: applStorage, decoders }));
  const googRouter = makeRouter(buildGooglePassHandlers({ config, storage: googStorage, decoders }));

  router.use('/api/decode', decoRouter.routes(), decoRouter.allowedMethods());
  router.use('/api/pass/apple', applRouter.routes(), applRouter.allowedMethods());
  router.use('/api/pass/google', googRouter.routes(), googRouter.allowedMethods());

  // -----------------------------------------------------------------------

  return router;
}
