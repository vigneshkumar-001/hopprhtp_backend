import { OtpChallengeModel, type OtpPurpose } from './auth.model';
import { UserModel, type UserDocument } from '../user/user.model';
import { hashSecret, verifySecret } from '../../common/utils/password';
import { generateNumericOtp } from '../../common/utils/codes';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../common/utils/jwt';
import { BadRequest, Conflict, TooManyRequests, Unauthorized } from '../../common/errors';
import { env, isProd } from '../../config/env';
import { logger } from '../../config/logger';
import type {
  ConfirmRegisterInput,
  LoginInput,
  PinResetConfirmInput,
  RequestOtpInput,
} from './auth.schema';
import { escrowService } from '../escrow/escrow.service';

const OTP_TTL_MS = 10 * 60_000; // 10 minutes
const MAX_OTP_ATTEMPTS = 5;
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 15 * 60_000;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function issueTokens(user: UserDocument): AuthTokens {
  const input = { userId: user.id, role: user.role, tokenVersion: user.tokenVersion };
  return { accessToken: signAccessToken(input), refreshToken: signRefreshToken(input) };
}

/** In production an SMS/WhatsApp provider sends this; in dev we log + return it. */
async function deliverOtp(phone: string, otp: string, purpose: string): Promise<void> {
  logger.info({ phone, purpose }, 'OTP generated');
  if (!isProd) logger.debug({ phone, otp }, '🔐 DEV OTP (do not log in prod)');
  // TODO: integrate Termii / Twilio / WhatsApp Cloud API here.
}

/** Reject when the previous code for this phone is still inside the cooldown window. */
async function assertResendCooldown(phone: string, purpose: OtpPurpose = 'register'): Promise<void> {
  const existing = await OtpChallengeModel.findOne({ phone, purpose }).lean();
  if (existing?.lastSentAt) {
    const waitMs =
      env.OTP_RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - new Date(existing.lastSentAt).getTime());
    if (waitMs > 0) {
      throw TooManyRequests(`Please wait ${Math.ceil(waitMs / 1000)}s before requesting a new code`);
    }
  }
}

/** Generate, persist (upsert), and deliver a fresh OTP — shared by request + resend. */
async function issueOtp(
  phone: string,
  context: { fullName?: string; email?: string },
  purpose: OtpPurpose = 'register',
): Promise<string> {
  const otp = generateNumericOtp(6);
  await OtpChallengeModel.findOneAndUpdate(
    { phone, purpose },
    {
      phone,
      purpose,
      otpHash: await hashSecret(otp),
      context,
      attempts: 0,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      lastSentAt: new Date(),
      createdAt: new Date(),
    },
    { upsert: true, new: true },
  );
  await deliverOtp(phone, otp, purpose);
  return otp;
}

/**
 * Loads the pending registration challenge and verifies the OTP (with the
 * dev-only bypass). On a wrong code it records the attempt and throws. Shared by
 * the standalone `verify-otp` check and `confirmRegister` so the rule lives once.
 * Does NOT consume the challenge — the caller decides when to delete it.
 */
async function loadAndVerifyOtp(phone: string, otp: string, purpose: OtpPurpose = 'register') {
  const challenge = await OtpChallengeModel.findOne({ phone, purpose });
  if (!challenge) throw BadRequest('No pending registration — request a new OTP');
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    throw TooManyRequests('Too many wrong codes, request a new one');
  }

  // Dev-only bypass for QA without a live SMS provider. Force-disabled in prod.
  const bypass = env.OTP_BYPASS_ENABLED && !isProd && otp === env.OTP_BYPASS_CODE;
  const valid = bypass || (await verifySecret(challenge.otpHash, otp));
  if (!valid) {
    challenge.attempts += 1;
    await challenge.save();
    throw BadRequest('Incorrect verification code');
  }
  return challenge;
}

async function loadAndVerifyPinResetOtp(phone: string, otp: string) {
  const challenge = await OtpChallengeModel.findOne({ phone, purpose: 'pin_reset' });
  if (!challenge) throw BadRequest('No pending PIN reset â€” request a new code');
  if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
    throw TooManyRequests('Too many wrong codes, request a new one');
  }

  const bypass = env.OTP_BYPASS_ENABLED && !isProd && otp === env.OTP_BYPASS_CODE;
  const valid = bypass || (await verifySecret(challenge.otpHash, otp));
  if (!valid) {
    challenge.attempts += 1;
    await challenge.save();
    throw BadRequest('Incorrect verification code');
  }
  return challenge;
}

export const authService = {
  /** Step 1 of the sign-up wizard: capture details, send a verification OTP. */
  async requestRegisterOtp(input: RequestOtpInput): Promise<{ devOtp?: string; cooldownSeconds: number }> {
    if (await UserModel.exists({ phone: input.phone })) {
      throw Conflict('An account with that phone already exists');
    }
    await assertResendCooldown(input.phone);
    const otp = await issueOtp(input.phone, { fullName: input.fullName, email: input.email });
    return { cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS, ...(isProd ? {} : { devOtp: otp }) };
  },

  /** Re-send the registration OTP (reuses the pending challenge's details). */
  async resendRegisterOtp(phone: string): Promise<{ devOtp?: string; cooldownSeconds: number }> {
    if (await UserModel.exists({ phone })) {
      throw Conflict('An account with that phone already exists');
    }
    const challenge = await OtpChallengeModel.findOne({ phone, purpose: 'register' });
    if (!challenge) throw BadRequest('No pending registration — please start sign-up again');
    await assertResendCooldown(phone);
    const otp = await issueOtp(phone, {
      fullName: challenge.context?.fullName,
      email: challenge.context?.email,
    });
    return { cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS, ...(isProd ? {} : { devOtp: otp }) };
  },

  /** Standalone OTP check for the Verify screen — validates without consuming. */
  async verifyRegisterOtp(phone: string, otp: string): Promise<{ verified: true }> {
    await loadAndVerifyOtp(phone, otp);
    return { verified: true };
  },

  /** Start the forgot-PIN flow by sending an OTP to the registered phone. */
  async requestPinReset(phone: string): Promise<{ devOtp?: string; cooldownSeconds: number }> {
    if (!(await UserModel.exists({ phone }))) {
      throw BadRequest('If the phone exists, a reset code will be sent');
    }
    await assertResendCooldown(phone, 'pin_reset');
    const otp = await issueOtp(phone, {}, 'pin_reset');
    return { cooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS, ...(isProd ? {} : { devOtp: otp }) };
  },

  /** Confirm the forgot-PIN flow and invalidate all existing sessions. */
  async confirmPinReset(input: PinResetConfirmInput): Promise<void> {
    const challenge = await loadAndVerifyPinResetOtp(input.phone, input.otp);
    const user = await UserModel.findOne({ phone: input.phone }).select('+pinHash');
    if (!user) throw BadRequest('If the phone exists, a reset code will be sent');

    user.pinHash = await hashSecret(input.newPin);
    if (!isProd) user.pin = input.newPin;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    user.failedPinAttempts = 0;
    user.lockedUntil = undefined;
    await user.save();
    await challenge.deleteOne();
  },

  /** Step 2 + 3: verify OTP and set the 6-digit PIN — creates the account. */
  async confirmRegister(input: ConfirmRegisterInput): Promise<{ user: UserDocument; tokens: AuthTokens }> {
    const challenge = await loadAndVerifyOtp(input.phone, input.otp);

    // Race-safe: unique index on phone is the final guard.
    if (await UserModel.exists({ phone: input.phone })) {
      throw Conflict('An account with that phone already exists');
    }

    const user = await UserModel.create({
      fullName: challenge.context?.fullName ?? 'Hoppr User',
      phone: input.phone,
      email: challenge.context?.email,
      pinHash: await hashSecret(input.pin),
      pin: isProd ? undefined : input.pin, // ⚠️ dev-only readable copy
    });

    await challenge.deleteOne();

    // Best-effort: provision an Escrow.com customer; never block sign-up on it.
    escrowService
      .ensureCustomer(user)
      .catch((err) => logger.warn({ err }, 'escrow customer provisioning failed'));

    return { user, tokens: issueTokens(user) };
  },

  async login(input: LoginInput): Promise<{ user: UserDocument; tokens: AuthTokens }> {
    const id = input.identifier.toLowerCase();
    const user = await UserModel.findOne({
      $or: [{ phone: input.identifier.trim() }, { email: id }],
    }).select('+pinHash');

    // Uniform error to avoid leaking which accounts exist.
    if (!user) throw Unauthorized('Invalid credentials');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw TooManyRequests('Account temporarily locked, try again shortly');
    }

    const valid = await verifySecret(user.pinHash, input.pin);
    if (!valid) {
      user.failedPinAttempts += 1;
      if (user.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + PIN_LOCK_MS);
        user.failedPinAttempts = 0;
      }
      await user.save();
      throw Unauthorized('Invalid credentials');
    }

    if (user.failedPinAttempts !== 0 || user.lockedUntil) {
      user.failedPinAttempts = 0;
      user.lockedUntil = undefined;
      await user.save();
    }

    return { user, tokens: issueTokens(user) };
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = verifyRefreshToken(refreshToken);
    const user = await UserModel.findById(payload.sub);
    if (!user) throw Unauthorized('Account no longer exists');
    if ((user.tokenVersion ?? 0) !== payload.tokenVersion) {
      throw Unauthorized('Session expired, please sign in again');
    }
    return issueTokens(user);
  },

  /** Revoke every issued token (logout-all / after PIN reset). */
  async logoutAll(userId: string): Promise<void> {
    await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  },

  /** Change the 6-digit PIN after verifying the current one. */
  async changePin(userId: string, currentPin: string, newPin: string): Promise<void> {
    const user = await UserModel.findById(userId).select('+pinHash');
    if (!user) throw Unauthorized('Account no longer exists');

    const valid = await verifySecret(user.pinHash, currentPin);
    if (!valid) throw BadRequest('Your current PIN is incorrect');

    user.pinHash = await hashSecret(newPin);
    if (!isProd) user.pin = newPin; // ⚠️ dev-only readable copy
    await user.save();
  },

  /**
   * Verify the user's PIN for a sensitive action (e.g. creating a transaction).
   * Same lockout as login. The PIN is checked against the Argon2id hash and is
   * never stored anywhere.
   */
  async verifyPin(userId: string, pin: string): Promise<void> {
    const user = await UserModel.findById(userId).select('+pinHash');
    if (!user) throw Unauthorized('Account no longer exists');
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw TooManyRequests('Account temporarily locked, try again shortly');
    }

    const valid = await verifySecret(user.pinHash, pin);
    if (!valid) {
      user.failedPinAttempts += 1;
      if (user.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + PIN_LOCK_MS);
        user.failedPinAttempts = 0;
      }
      await user.save();
      throw BadRequest('Incorrect PIN');
    }

    if (user.failedPinAttempts !== 0 || user.lockedUntil) {
      user.failedPinAttempts = 0;
      user.lockedUntil = undefined;
      await user.save();
    }
  },
};
