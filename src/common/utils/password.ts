import argon2 from 'argon2';

/**
 * Argon2id is the current OWASP-recommended password/PIN hashing algorithm.
 * We use it for the 6-digit transaction PIN. Because a PIN has very low entropy,
 * hashing alone is not enough — pair this with the per-account attempt lockout
 * enforced in the auth service.
 */
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export const hashSecret = (plain: string): Promise<string> =>
  argon2.hash(plain, OPTIONS);

export async function verifySecret(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
