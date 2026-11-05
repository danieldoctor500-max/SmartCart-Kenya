import { z } from "zod";

export const addCartItemSchema = z
  .object({
    productId: z.string().trim().min(1).max(128),
    quantity: z.number().int().min(1).max(100),
  })
  .strict();

export const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(100),
  })
  .strict();

export const cartItemIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128);

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
