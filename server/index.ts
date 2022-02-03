import morgan from 'morgan';
import { compose, trim } from 'ramda';

import { Logger } from '@navch/common';
import { makeRouter, middlewares, setRequestContext } from '@navch/http';

import { AppConfig } from './config';
import { buildInMemoryStorage } from './storage';
import { buildDecoderHandlers } from './decoder/handler';
import { buildApplePassHandlers } from './applepass/handler';
import { buildGooglePassHandlers } from './googlepass/handler';

export function buildHandler() {
  const config = new AppConfig();
  const logger = new Logger({ name: 'viper', prettyPrint: !config.isProdEnv });

  const applStorage = buildInMemoryStorage();
  const googStorage = buildInMemoryStorage();

  const requestLogger = morgan('dev', {
    stream: { write: compose(logger.debug, trim) },
  });

  const router = makeRouter();
  router.use(setRequestContext({ logger }));
  router.use(middlewares.fromCallback(requestLogger));

  // -----------------------------------------------------------------------
  // TODO Launch services on demand
  //
  // This project is designed for demonstration purposes that you might only be
  // interested in some of the functionalities it provides. Therefore, we don't
  // enforce you to provide all environment variables to start with.

  const decoRouter = makeRouter(buildDecoderHandlers());
  const applRouter = makeRouter(buildApplePassHandlers({ config, storage: applStorage }));
  const googRouter = makeRouter(buildGooglePassHandlers({ config, storage: googStorage }));

  router.use('/api/decode', decoRouter.routes(), decoRouter.allowedMethods());
  router.use('/api/pass/ios', applRouter.routes(), applRouter.allowedMethods());
  router.use('/api/pass/android', googRouter.routes(), googRouter.allowedMethods());

  // -----------------------------------------------------------------------

  return router;
}
