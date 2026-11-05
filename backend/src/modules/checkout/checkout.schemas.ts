import { z } from "zod";

const addressId = z.string().trim().min(1).max(128);

export const checkoutAddressSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("saved"),
      addressId,
    })
    .strict(),
  z
    .object({
      type: z.literal("new"),
      recipientName: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(7).max(30),
      county: z.string().trim().min(2).max(100),
      town: z.string().trim().min(1).max(100),
      addressLine: z.string().trim().min(4).max(300),
      deliveryInstructions: z
        .string()
        .trim()
        .max(500)
        .optional(),
      saveAsDefault: z.boolean().default(false),
    })
    .strict(),
]);

export const createCheckoutSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    address: checkoutAddressSchema,
  })
  .strict();

export const checkoutQuoteQuerySchema = z.union([
  z.object({ addressId }).strict(),
  z
    .object({
      county: z.string().trim().min(2).max(100),
      town: z.string().trim().min(1).max(100),
    })
    .strict(),
]);

export type CheckoutAddressInput = z.infer<
  typeof checkoutAddressSchema
>;
export type CreateCheckoutInput = z.infer<
  typeof createCheckoutSchema
>;
export type CheckoutQuoteQuery = z.infer<
  typeof checkoutQuoteQuerySchema
>;
