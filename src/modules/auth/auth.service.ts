import { OtpChallengeModel } from './auth.model';
import { UserModel, type UserDocument } from '../user/user.model';
import { hashSecret, verifySecret } from '../../common/utils/password';
import { generateNumericOtp } from '../../common/utils/codes';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../common/utils/jwt';
import { BadRequest, Conflict, TooManyRequests, Unauthorized } from '../../common/errors';
import { isProd } from '../../config/env';
import { logger } from '../../config/logger';
import type { ConfirmRegisterInput, LoginInput, RequestOtpInput } from './auth.schema';
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

export const authService = {
  /** Step 1 of the sign-up wizard: capture details, send a verification OTP. */
  async requestRegisterOtp(input: RequestOtpInput): Promise<{ devOtp?: string }> {
    const existing = await UserModel.exists({ phone: input.phone });
    if (existing) throw Conflict('An account with that phone already exists');

    const otp = generateNumericOtp(6);
    await OtpChallengeModel.findOneAndUpdate(
      { phone: input.phone, purpose: 'register' },
      {
        phone: input.phone,
        purpose: 'register',
        otpHash: await hashSecret(otp),
        context: { fullName: input.fullName, email: input.email },
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        createdAt: new Date(),
      },
      { upsert: true, new: true },
    );

    await deliverOtp(input.phone, otp, 'register');
    return isProd ? {} : { devOtp: otp };
  },

  /** Step 2 + 3: verify OTP and set the 6-digit PIN — creates the account. */
  async confirmRegister(input: ConfirmRegisterInput): Promise<{ user: UserDocument; tokens: AuthTokens }> {
    const challenge = await OtpChallengeModel.findOne({ phone: input.phone, purpose: 'register' });
    if (!challenge) throw BadRequest('No pending registration — request a new OTP');
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) throw TooManyRequests('Too many wrong codes, request a new one');

    const valid = await verifySecret(challenge.otpHash, input.otp);
    if (!valid) {
      challenge.attempts += 1;
      await challenge.save();
      throw BadRequest('Incorrect verification code');
    }

    // Race-safe: unique index on phone is the final guard.
    if (await UserModel.exists({ phone: input.phone })) {
      throw Conflict('An account with that phone already exists');
    }

    const user = await UserModel.create({
      fullName: challenge.context?.fullName ?? 'Hoppr User',
      phone: input.phone,
      email: challenge.context?.email,
      pinHash: await hashSecret(input.pin),
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
};
