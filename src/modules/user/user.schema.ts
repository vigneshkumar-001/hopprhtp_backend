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
    fullName: z.string().trim().min(2).max(80).optional(),
    phone: phone.optional(),
    email: z.string().trim().email().optional(),
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
  documentUrl: z.string().url(),
  selfieUrl: z.string().url(),
});

export const objectIdParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AddPayoutAccountInput = z.infer<typeof addPayoutAccountSchema>;
export type IdentityVerifyInput = z.infer<typeof identityVerifySchema>;
