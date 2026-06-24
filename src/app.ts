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

  // ── Webhooks: mounted with a RAW body parser BEFORE express.json so the HMAC
  //    signature can be verified over the exact received bytes. ──────────────
  app.use('/api/v1/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhookRoutes);

  // ── Body parsing + injection hardening for the JSON API ──────────────────
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(mongoSanitize()); // strip $ / . operators from user input
  app.use(hpp()); // guard against HTTP parameter pollution

  // ── Routes ───────────────────────────────────────────────────────────────
  app.use('/api/v1', apiLimiter, apiRouter);

  // ── 404 + centralised error handling (must be last) ──────────────────────
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
