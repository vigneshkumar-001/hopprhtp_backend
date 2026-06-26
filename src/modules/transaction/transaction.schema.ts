import { z } from 'zod';

const payout = z.object({
  dispatcherName: z.string().trim().min(2).max(80),
  dispatcherPhone: z.string().trim().min(7).max(20),
  bank: z.string().trim().min(2).max(60),
  accountNumber: z.string().trim().regex(/^\d{10}$/, 'Account number must be 10 digits'),
  accountName: z.string().trim().min(2).max(80),
});

const consignment = z.object({
  product: z.string().trim().min(1).max(120),
  amountNaira: z.number().positive().max(1_000_000_000),
  quantity: z.string().trim().max(40).optional(),
  weight: z.string().trim().max(40).optional(),
  buyerName: z.string().trim().max(120).optional(),
  buyerContact: z.string().trim().min(3).max(120),
  deliveryAddress: z.string().trim().max(240).optional(),
  waybillTrackingNumber: z.string().trim().max(80).optional(),
  payout: payout.optional(),
  dispatcherAddress: z.string().trim().max(240).optional(),
  specialInstructions: z.string().trim().max(500).optional(),
  dispatchPhotoUrl: z.string().url().optional(),
  waybillImageUrl: z.string().url().optional(),
});

export const createTransactionSchema = z.object({
  consignments: z.array(consignment).min(1, 'Add at least one consignment').max(20),
  feeSplit: z.enum(['buyer', 'split', 'seller']).default('split'),
  deliveryFeeNaira: z.number().min(0).max(10_000_000).optional(),
  variant: z.string().trim().max(120).optional(),
  // 3600=perishable, 21600=fashion, 86400=electronics (defaults to 24h).
  inspectionPeriodSeconds: z.coerce.number().int().positive().max(2_592_000).optional(),
  buyerEmail: z.string().email().optional(),
  sellerEmail: z.string().email().optional(),
});

export const listQuerySchema = z.object({
  stage: z.enum(['active', 'cooling', 'done']).optional(),
  status: z.string().optional(),
  role: z.enum(['seller', 'buyer']).optional(),
  // Pagination (used by the infinite-scroll history). When absent, the list
  // returns up to a single large page (back-compat for the dashboard).
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const shipSchema = z.object({
  carrier: z.string().trim().max(60).optional(),
  trackingNumber: z.string().trim().max(80).optional(),
});

export const confirmDeliverySchema = z.object({
  otp: z.string().trim().regex(/^\d{4,8}$/, 'Enter the delivery code'),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const cancelSchema = z.object({ reason: z.string().trim().max(240).optional() });

export const codeParam = z.object({
  code: z.string().trim().regex(/^HTP-[A-Z0-9]{4}$/i, 'Invalid transaction code'),
});

export const idParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

export type CreateTransactionBody = z.infer<typeof createTransactionSchema>;
