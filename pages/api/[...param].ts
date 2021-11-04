import { NextApiRequest, NextApiResponse } from 'next';

import { buildHandler } from '../../server';

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Helper function to wait for a middleware to execute before continuing, and to
 * throw an error when an error happens in a middleware.
 *
 * This utility function is designed for frameworks to use `Connect` compatible
 * middlewares, such as `Next.js`.
 *
 * @see {@link https://github.com/senchalabs/connect}
 * @see {@link https://nextjs.org/docs/api-routes/api-middlewares}
 */
function runMiddleware(req: NextApiRequest, res: NextApiResponse, fn: Function) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: unknown) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
}

/**
 * Helper function that executes middlewares in sequence, and returns the result
 * of the last middleware.
 *
 * @see {@link runMiddleware}
 */
function runMiddlewares(req: NextApiRequest, res: NextApiResponse, fns: Function[]) {
  return fns.reduce(async (middleware, next) => {
    await middleware;
    return runMiddleware(req, res, next);
  }, Promise.resolve());
}

const middlewares = buildHandler();

async function handler(req: NextApiRequest, res: NextApiResponse) {
  return runMiddlewares(req, res, middlewares);
}
export default handler;
