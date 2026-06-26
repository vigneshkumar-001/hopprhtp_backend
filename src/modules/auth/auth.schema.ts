import { z } from 'zod';

const phone = z
  .string()
  .trim()
  .min(7)
  .max(20)
  .regex(/^[+0-9 ()-]+$/, 'Invalid phone number');

const pin = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'PIN must be exactly 6 digits');

const otp = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'OTP must be 6 digits');

export const requestOtpSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone,
  email: z.string().trim().email().optional(),
});

export const confirmRegisterSchema = z.object({
  phone,
  otp,
  pin,
});

export const resendOtpSchema = z.object({ phone });
export const verifyOtpSchema = z.object({ phone, otp });
export const verifyPinSchema = z.object({ pin });

export const changePinSchema = z
  .object({ currentPin: pin, newPin: pin })
  .refine((v) => v.currentPin !== v.newPin, {
    message: 'New PIN must be different from the current one',
    path: ['newPin'],
  });

export const loginSchema = z.object({
  // identifier = phone OR email
  identifier: z.string().trim().min(3).max(120),
  pin,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const pinResetRequestSchema = z.object({ phone });
export const pinResetConfirmSchema = z.object({ phone, otp, newPin: pin });

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type ConfirmRegisterInput = z.infer<typeof confirmRegisterSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PinResetConfirmInput = z.infer<typeof pinResetConfirmSchema>;
