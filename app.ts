import fs from 'fs';
import next from 'next';
import morgan from 'morgan';
import express from 'express';
import errorhandler from 'errorhandler';
import { compose, trim } from 'ramda';

import { Logger } from '@navch/common';
import { setRequestContext } from '@navch/express';

import { AppConfig, ApplePassConfig, GooglePayPassConfig } from './server/config';
import * as iosPassHandlers from './server/pass/ios.handler';
import * as androidPassHandlers from './server/pass/android.handler';

// Load environment variables from .env* files. It will not modify any
// environment variables that have already been set.
// https://github.com/motdotla/dotenv
const dotenvFiles = ['.env.local', '.env'];
dotenvFiles.forEach(dotenvFile => {
  if (fs.existsSync(dotenvFile)) {
    require('dotenv').config({ path: dotenvFile });
  }
});

(async function bootstrap() {
  const config = new AppConfig();
  const logger = new Logger({ name: 'viper', prettyPrint: !config.isProdEnv });
  const requestLogger = morgan('dev', {
    stream: { write: compose(logger.debug, trim) },
    skip: ({ path, baseUrl }: express.Request) => {
      return !!path.match(/^\/_+next/) || !!baseUrl?.match(/^\/health/);
    },
  });

  const app = express();
  app.use(requestLogger);
  app.use(errorhandler({ log: (err, msg) => logger.error(msg, err) }));
  app.use('/health', (_, res) => {
    res.status(200).send('Ok');
  });

  const contextMiddleware = setRequestContext({ logger });
  app.use(contextMiddleware);

  // -----------------------------------------------------------------------
  // TODO Launch services that have sufficient configs
  //
  // This project is designed for demonstration purposes that you might only be
  // interested in some of the functionalities it provides. Therefore, we don't
  // enforce you to provide all environment variables to start with.

  try {
    const router = iosPassHandlers.buildRouter({
      config: new ApplePassConfig(),
    });
    app.use('/viper/pass/ios', router);
  } catch (err) {
    logger.warn(`Disabled router '/viper/pass/android': ${err}`);
  }

  try {
    const router = androidPassHandlers.buildRouter({
      config: new GooglePayPassConfig(),
    });
    app.use('/viper/pass/android', router);
  } catch (err) {
    logger.warn(`Disabled router '/viper/pass/android': ${err}`);
  }

  // -----------------------------------------------------------------------

  const web = next({ dev: !config.isProdEnv });
  await web.prepare();

  const webHandler = web.getRequestHandler();
  app.all('*', (req, res) => webHandler(req, res));

  const server = app.listen(config.port, () => {
    logger.info(`Server listening at ${JSON.stringify(server.address())}`);
  });
})().catch(err => {
  console.error('Failed to launch server', err);
  process.exit(1);
});
