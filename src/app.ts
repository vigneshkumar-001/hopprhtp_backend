import path from 'node:path';
import express, { type Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import hpp from 'hpp';
import mongoSanitize from 'express-mongo-sanitize';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { apiRouter } from './routes';
import { webhookRoutes } from './modules/webhook/webhook.routes';
import { apiLimiter } from './common/middleware/rateLimiter';
import { errorHandler, notFoundHandler } from './common/middleware/errorHandler';

export function createApp(): Application {
  const app = express();

  // Behind a load balancer / reverse proxy (correct client IPs for rate-limit).
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // ── Security & performance middleware ────────────────────────────────────
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : true,
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(pinoHttp({ logger }));

  // ── Uploaded images: served as static files. Names are random and the bytes
  //    were validated on upload, so this only ever exposes safe image content.
  app.use(
    '/uploads',
    express.static(path.resolve(process.cwd(), env.UPLOAD_DIR), {
      index: false,
      dotfiles: 'deny',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }),
  );

  // ── Webhooks: mounted with a RAW body parser BEFORE express.json so the HMAC
  //    signature can be verified over the exact received bytes. ──────────────
  app.use('/api/v1/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRoutes);

  // ── Body parsing + injection hardening for the JSON API ──────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(mongoSanitize()); // strip $ / . operators from user input
  app.use(hpp()); // guard against HTTP parameter pollution

  // ── Hosted checkout page (opened from the buyer's payment link) ──────────
  // A self-contained page with an inline script — helmet's default CSP blocks
  // inline <script>, so relax it just for this route.
  app.get('/pay/:code', (_req, res) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self'",
      ].join('; '),
    );
    res.sendFile(path.join(process.cwd(), 'public', 'checkout.html'));
  });

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/v1', apiLimiter, apiRouter);

  // ── 404 + centralised error handling (must be last) ──────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
