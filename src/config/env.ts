import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Strongly-typed, validated environment. The process refuses to boot if a
 * required variable is missing or malformed — fail fast, never at request time.
 */
const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),

  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET too short'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET too short'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  ESCROW_API_URL: z.string().url().default('https://api.escrow.com/2017-09-01'),
  ESCROW_PAY_URL: z
    .string()
    .url()
    .default('https://api.escrow.com/integration/pay/2018-03-31'),
  ESCROW_EMAIL: z.string().default(''),
  ESCROW_API_KEY: z.string().default(''),
  ESCROW_WEBHOOK_SECRET: z.string().default(''),

  TRUST_FEE_RATE: z.coerce.number().min(0).max(1).default(0.015),
  DEFAULT_DELIVERY_FEE_NGN: z.coerce.number().min(0).default(7500),
  DELIVERY_GEOFENCE_METRES: z.coerce.number().positive().default(200),
  DELIVERY_OTP_TTL_DAYS: z.coerce.number().positive().default(7),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error(
    '❌ Invalid environment configuration:\n',
    JSON.stringify(parsed.error.flatten().fieldErrors, null, 2),
  );
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';
