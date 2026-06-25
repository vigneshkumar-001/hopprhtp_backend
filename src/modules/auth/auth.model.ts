import { Schema, model, type Model } from 'mongoose';

export type OtpPurpose = 'register' | 'pin_reset';

export interface OtpChallengeDoc {
  phone: string;
  purpose: OtpPurpose;
  otpHash: string; // argon2 hash of the 6-digit OTP
  context?: { fullName?: string; email?: string }; // carried through registration
  attempts: number;
  expiresAt: Date;
  lastSentAt?: Date; // throttles resend (cooldown)
  createdAt: Date;
}

const OtpChallengeSchema = new Schema<OtpChallengeDoc>(
  {
    phone: { type: String, required: true, index: true },
    purpose: { type: String, enum: ['register', 'pin_reset'], required: true },
    otpHash: { type: String, required: true },
    context: {
      fullName: String,
      email: String,
    },
    attempts: { type: Number, default: 0 },
    // TTL index — Mongo auto-deletes the challenge once it expires.
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    lastSentAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

OtpChallengeSchema.index({ phone: 1, purpose: 1 });

export const OtpChallengeModel: Model<OtpChallengeDoc> = model<OtpChallengeDoc>(
  'OtpChallenge',
  OtpChallengeSchema,
);
