import axios, { type AxiosInstance, AxiosError } from 'axios';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { Upstream } from '../../common/errors';

/**
 * Thin, typed wrapper around the two Escrow.com base URLs:
 *   - REST API   (https://api.escrow.com/2017-09-01)
 *   - Escrow Pay (https://api.escrow.com/integration/pay/2018-03-31)
 *
 * Auth is HTTP Basic with `email:api_key`. All calls are centralised here so
 * retries, logging and error normalisation live in one place.
 */
function basicAuthHeader(): string {
  const raw = `${env.ESCROW_EMAIL}:${env.ESCROW_API_KEY}`;
  return `Basic ${Buffer.from(raw).toString('base64')}`;
}

function build(baseURL: string): AxiosInstance {
  const instance = axios.create({
    baseURL,
    timeout: 15_000,
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(),
    },
  });

  instance.interceptors.response.use(
    (res) => res,
    (error: AxiosError) => {
      const status = error.response?.status;
      const data = error.response?.data;
      logger.error({ status, data, url: error.config?.url }, 'Escrow.com API error');
      return Promise.reject(
        Upstream('Escrow.com request failed', { status, data }),
      );
    },
  );

  return instance;
}

export const escrowRest = build(env.ESCROW_API_URL);
export const escrowPay = build(env.ESCROW_PAY_URL);

/** True only when real Escrow.com credentials are configured. */
export const escrowConfigured = (): boolean =>
  Boolean(env.ESCROW_EMAIL && env.ESCROW_API_KEY);
