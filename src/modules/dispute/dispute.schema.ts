import { z } from 'zod';
import { DISPUTE_CATEGORIES } from './dispute.model';

export const raiseDisputeSchema = z.object({
  transactionId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid transaction id'),
  category: z.enum(DISPUTE_CATEGORIES),
  reason: z.string().trim().max(500).optional(),
  evidence: z
    .array(
      z.object({
        type: z.enum(['image', 'document', 'text']),
        url: z.string().url().optional(),
        note: z.string().max(500).optional(),
      }),
    )
    .max(10)
    .optional()
    .default([]),
});

export const resolveDisputeSchema = z.object({
  outcome: z.enum(['buyer_favored', 'seller_favored']),
  note: z.string().trim().max(500).optional(),
});

export const idParam = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id') });

export type RaiseDisputeInput = z.infer<typeof raiseDisputeSchema>;
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;
