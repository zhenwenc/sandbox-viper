import morgan from 'morgan';
import { RequestHandler, Router } from 'express';
import { compose, trim } from 'ramda';

import { Logger } from '@navch/common';
import { withRouter, middlewares } from '@navch/express';

import { AppConfig, ApplePassConfig, GooglePayPassConfig } from './config';
import buildApplePassHandlers from './applepass/handler';
import buildGooglePassHandlers from './googlepass/handler';

export function buildHandler(): RequestHandler[] {
  const config = new AppConfig();
  const logger = new Logger({ name: 'viper', prettyPrint: !config.isProdEnv });

  const requestLogger = morgan('dev', {
    stream: { write: compose(logger.debug, trim) },
  });

  const requestContext = middlewares.setRequestContext({ logger });

  // -----------------------------------------------------------------------
  // TODO Launch services on demand
  //
  // This project is designed for demonstration purposes that you might only be
  // interested in some of the functionalities it provides. Therefore, we don't
  // enforce you to provide all environment variables to start with.

  const applePassRouter = buildApplePassHandlers({ config: new ApplePassConfig() });
  const googlePassRouter = buildGooglePassHandlers({ config: new GooglePayPassConfig() });

  const router = Router();
  router.use('/api/pass/ios', withRouter(Router(), applePassRouter));
  router.use('/api/pass/android', withRouter(Router(), googlePassRouter));

  // -----------------------------------------------------------------------

  return [requestLogger, requestContext, router];
}
