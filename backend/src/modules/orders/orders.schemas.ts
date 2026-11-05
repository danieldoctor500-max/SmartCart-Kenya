import { z } from "zod";

export const ordersQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const orderIdSchema = z.string().trim().min(1).max(128);
