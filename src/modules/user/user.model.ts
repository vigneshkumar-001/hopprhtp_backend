import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export type Role = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type IdentityStatus = 'unverified' | 'pending' | 'verified' | 'rejected';
export type IdDocType = 'nin' | 'drivers_license' | 'passport';
export type AccountType = 'individual' | 'company';

export interface DateOfBirth {
  day: number;
  month: number;
  year: number;
}

export interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

/** A saved bank account a seller receives settlements into. */
export interface PayoutAccount {
  _id: Types.ObjectId;
  bank: string;
  accountNumberLast4: string; // we never store the full number in clear text
  accountNumberEnc?: string; // reserved for encrypted-at-rest full number
  accountName: string;
  isDefault: boolean;
  verified: boolean;
  createdAt: Date;
}

export interface IdentityVerification {
  status: IdentityStatus;
  docType?: IdDocType;
  documentFrontUrl?: string;
  documentBackUrl?: string;
  selfieUrl?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
}

export interface UserAttrs {
  fullName: string;
  phone: string;
  email?: string;
  pinHash: string;
}

export interface UserDoc {
  _id: Types.ObjectId;
  fullName: string;
  phone: string;
  email?: string;
  pinHash: string;
  pin?: string; // ⚠️ DEV-ONLY plaintext PIN for debugging — never set in production
  role: Role;
  status: UserStatus;

  // Extended profile (Edit Profile screen).
  accountType: AccountType;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dob?: DateOfBirth;
  phoneCountry?: string; // ISO-3166 alpha-2 of the phone's country
  address?: Address;

  // Trust metrics surfaced on the profile / merchant screens.
  trustScore: number; // 0..100
  trustGrade: string; // "A+", "A", ...
  deals: number;
  disputes: number;

  identity: IdentityVerification;
  payoutAccounts: PayoutAccount[];

  // Money is kept in kobo. escrowBalance = funds locked in active escrows;
  // walletAvailable = withdrawable; walletCooling = pending cooling release.
  escrowBalanceKobo: number;
  walletAvailableKobo: number;
  walletCoolingKobo: number;

  // Security: bump tokenVersion to revoke every issued JWT at once.
  tokenVersion: number;
  failedPinAttempts: number;
  lockedUntil?: Date;
  escrowCustomerId?: string; // id returned by Escrow.com /customer

  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserDoc>;
export type UserModelType = Model<UserDoc>;

const PayoutAccountSchema = new Schema<PayoutAccount>(
  {
    bank: { type: String, required: true, trim: true },
    accountNumberLast4: { type: String, required: true },
    accountNumberEnc: { type: String, select: false },
    accountName: { type: String, required: true, trim: true },
    isDefault: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const trustGradeFor = (score: number): string =>
  score >= 95 ? 'A+' : score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D';

const UserSchema = new Schema<UserDoc>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    pinHash: { type: String, required: true, select: false },
    // ⚠️ DEV-ONLY readable PIN. Only written when NODE_ENV !== 'production'
    // (see auth.service). Hidden from API responses via the toJSON transform.
    pin: { type: String, select: false },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },

    accountType: { type: String, enum: ['individual', 'company'], default: 'individual' },
    firstName: { type: String, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    dob: { day: Number, month: Number, year: Number },
    phoneCountry: { type: String, trim: true },
    address: {
      line1: { type: String, trim: true },
      line2: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      postalCode: { type: String, trim: true },
      country: { type: String, trim: true },
    },

    trustScore: { type: Number, default: 80, min: 0, max: 100 },
    trustGrade: { type: String, default: 'A' },
    deals: { type: Number, default: 0, min: 0 },
    disputes: { type: Number, default: 0, min: 0 },

    identity: {
      status: { type: String, enum: ['unverified', 'pending', 'verified', 'rejected'], default: 'unverified' },
      docType: { type: String, enum: ['nin', 'drivers_license', 'passport'] },
      documentFrontUrl: String,
      documentBackUrl: String,
      selfieUrl: String,
      reviewedAt: Date,
      rejectionReason: String,
    },

    payoutAccounts: { type: [PayoutAccountSchema], default: [] },

    escrowBalanceKobo: { type: Number, default: 0, min: 0 },
    walletAvailableKobo: { type: Number, default: 0, min: 0 },
    walletCoolingKobo: { type: Number, default: 0, min: 0 },

    tokenVersion: { type: Number, default: 0 },
    failedPinAttempts: { type: Number, default: 0 },
    lockedUntil: Date,
    escrowCustomerId: String,
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).pinHash;
        delete (ret as Record<string, unknown>).pin; // never leak the plaintext PIN over the API
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  },
);

// Keep the trust grade in sync with the numeric score.
UserSchema.pre('save', function preSave(next) {
  if (this.isModified('trustScore')) this.trustGrade = trustGradeFor(this.trustScore);
  next();
});

UserSchema.virtual('verified').get(function verified(this: UserDoc) {
  return this.identity.status === 'verified';
});

export const UserModel = model<UserDoc>('User', UserSchema);
