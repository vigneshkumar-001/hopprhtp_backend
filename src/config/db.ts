import mongoose from 'mongoose';
import { env, isProd } from './env';
import { logger } from './logger';

mongoose.set('strictQuery', true);
// Surface slow / mis-shaped queries during development.
if (!isProd) mongoose.set('debug', false);

/**
 * Connect to MongoDB with sane pool + timeout settings. Retries are handled by
 * the driver; a hard failure aborts boot so the orchestrator can restart us.
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  const conn = await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45000,
    autoIndex: !isProd, // build indexes in dev; do it explicitly in prod deploys
  });

  logger.info(
    { db: conn.connection.name, host: conn.connection.host },
    '✅ MongoDB connected',
  );

  mongoose.connection.on('error', (err) =>
    logger.error({ err }, 'MongoDB connection error'),
  );
  mongoose.connection.on('disconnected', () =>
    logger.warn('MongoDB disconnected'),
  );

  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}
