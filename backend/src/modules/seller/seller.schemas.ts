
import { z } from "zod";

export const submitSellerApplicationSchema = z
  .object({
    businessName: z
      .string()
      .trim()
      .min(2, "Business name must contain at least 2 characters.")
      .max(120, "Business name cannot exceed 120 characters."),

    phone: z
      .string()
      .trim()
      .min(7, "Phone number must contain at least 7 characters.")
      .max(30, "Phone number cannot exceed 30 characters.")
      .optional(),

    email: z
      .string()
      .trim()
      .email("Enter a valid business email address.")
      .max(254, "Email cannot exceed 254 characters.")
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  .strict();

export type SubmitSellerApplicationInput = z.infer<
  typeof submitSellerApplicationSchema
>;
