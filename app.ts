import next from 'next';
import dotenv from 'dotenv';
import morgan from 'morgan';
import express from 'express';
import errorhandler from 'errorhandler';
import { compose, trim } from 'ramda';

import { Logger } from '@navch/common';
import { setRequestContext } from '@navch/express';

import * as iosPassHandlers from './server/pass/ios.handler';

dotenv.config({ path: '.env.local' });

(async function bootstrap() {
  const port = process.env.PORT || '3000';

  const logger = new Logger({
    name: 'viper',
    prettyPrint: process.env.NODE_ENV !== 'production',
  });
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

  app.use('/viper', iosPassHandlers.buildRouter({}));

  // -----------------------------------------------------------------------

  const web = next({ dev: process.env.NODE_ENV !== 'production' });
  await web.prepare();

  const webHandler = web.getRequestHandler();
  app.all('*', (req, res) => webHandler(req, res));

  const server = app.listen(port, () => {
    logger.info(`Server listening at ${JSON.stringify(server.address())}`);
  });
})().catch(err => {
  console.error('Failed to launch server', err);
  process.exit(1);
});
