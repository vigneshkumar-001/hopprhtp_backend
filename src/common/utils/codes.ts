import crypto from 'node:crypto';

// Unambiguous alphabet (no 0/O/1/I) for human-readable transaction codes.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomFrom(alphabet: string, length: number): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length]!;
  }
  return out;
}

/** Public transaction code shown in the app, e.g. `HTP-7Q2K`. */
export const generateTransactionCode = (): string =>
  `HTP-${randomFrom(ALPHABET, 4)}`;

/** Public dispute case id, e.g. `DSP-4F9M`. */
export const generateDisputeCode = (): string =>
  `DSP-${randomFrom(ALPHABET, 4)}`;

/** Numeric delivery OTP (default 6 digits) delivered to the dispatcher. */
export function generateNumericOtp(length = 6): string {
  let out = '';
  for (let i = 0; i < length; i++) out += crypto.randomInt(0, 10).toString();
  return out;
}

/** Opaque, URL-safe token (refresh-token jti, idempotency keys, etc.). */
export const randomToken = (bytes = 32): string =>
  crypto.randomBytes(bytes).toString('base64url');

/** Constant-time string comparison (OTP / signature checks). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
