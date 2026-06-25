import { z } from 'zod';
import { SUPPORT_CATEGORIES } from './support.model';

export const createTicketSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z.string().trim().min(3, 'Add a short subject').max(120),
  message: z
    .string()
    .trim()
    .min(10, 'Please describe your issue (at least 10 characters)')
    .max(2000),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
