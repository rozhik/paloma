import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import router from './routes/index.js';
import { apiErrorHandler } from './services/apiError.js';

/**
 * The Express app. With auth on, only the client origin from `.env` may call the API with credentials (and
 * none when it is unset, for a client served from the same origin); with auth off any origin may, as before.
 */
export function createApp(): express.Express {
  const app = express();
  // A reverse proxy on this machine (e.g. one that terminates HTTPS) tells the real client and protocol
  app.set('trust proxy', 'loopback');
  const { mode, clientOrigin } = config.auth;
  app.use(mode === 'on'
    ? cors({ origin: (origin, done) => done(null, clientOrigin !== null && origin === clientOrigin), credentials: true })
    : cors());
  app.use(express.json({ limit: '50mb' }));

  app.use('/api', router);
  app.use('/api', apiErrorHandler);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'Paloma Express Server' });
  });
  return app;
}
