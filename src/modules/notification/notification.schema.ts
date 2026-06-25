import { z } from 'zod';

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const idParam = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});
