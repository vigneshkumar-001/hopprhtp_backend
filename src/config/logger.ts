import pino from 'pino';
import { env, isProd } from './env';

/**
 * Structured JSON logger. Pretty-prints in development, ships compact JSON in
 * production (ready for Datadog / Loki / CloudWatch ingestion).
 */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : isProd ? 'info' : 'debug',
  base: { service: 'hoppr-escrow-api' },
  redact: {
    // Never let secrets or PII land in the logs.
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.pin',
      'req.body.password',
      'req.body.otp',
      '*.pinHash',
      '*.accountNumber',
    ],
    censor: '[redacted]',
  },
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,service' },
      },
});
