import { z } from 'zod';

// Nigerian phone numbers, lenient: allow +234 / 0 prefixes and spaces.
const phone = z
  .string()
  .trim()
  .min(7, 'Phone number looks too short')
  .max(20)
  .regex(/^[+0-9 ()-]+$/, 'Invalid phone number');

export const updateProfileSchema = z
  .object({
    accountType: z.enum(['individual', 'company']).optional(),
    firstName: z.string().trim().min(1).max(60).optional(),
    middleName: z.string().trim().max(60).optional(),
    lastName: z.string().trim().min(1).max(60).optional(),
    fullName: z.string().trim().min(2).max(80).optional(),
    phone: phone.optional(),
    phoneCountry: z.string().trim().max(4).optional(), // ISO-2
    email: z.string().trim().email().optional(),
    dob: z
      .object({
        day: z.coerce.number().int().min(1).max(31),
        month: z.coerce.number().int().min(1).max(12),
        year: z.coerce.number().int().min(1900).max(new Date().getFullYear()),
      })
      .optional(),
    address: z
      .object({
        line1: z.string().trim().max(120).optional(),
        line2: z.string().trim().max(120).optional(),
        city: z.string().trim().max(80).optional(),
        state: z.string().trim().max(80).optional(),
        postalCode: z.string().trim().max(20).optional(),
        country: z.string().trim().max(80).optional(),
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' });

export const addPayoutAccountSchema = z.object({
  bank: z.string().trim().min(2).max(60),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Account number must be 10 digits'),
  accountName: z.string().trim().min(2).max(80),
  makeDefault: z.boolean().optional().default(false),
});

export const identityVerifySchema = z.object({
  docType: z.enum(['nin', 'drivers_license', 'passport']),
  documentFrontUrl: z.string().url(),
  // Single-sided documents (e.g. passport data page) may omit the back.
  documentBackUrl: z.string().url().optional(),
  selfieUrl: z.string().url(),
});

export const objectIdParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddPayoutAccountInput = z.infer<typeof addPayoutAccountSchema>;
export type IdentityVerifyInput = z.infer<typeof identityVerifySchema>;
