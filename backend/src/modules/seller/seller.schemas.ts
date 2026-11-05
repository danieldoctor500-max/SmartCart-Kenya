
import { z } from "zod";

function isHttpImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

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

const productImageSchema = z
  .object({
    imageUrl: z
      .string()
      .trim()
      .url("Enter a valid image URL.")
      .max(2048, "Image URLs cannot exceed 2048 characters.")
      .refine(
        isHttpImageUrl,
        "Image URLs must use HTTP or HTTPS and cannot contain credentials.",
      ),
    altText: z
      .string()
      .trim()
      .max(250, "Image descriptions cannot exceed 250 characters.")
      .optional(),
  })
  .strict();

const productFields = {
  name: z
    .string()
    .trim()
    .min(2, "Product name must contain at least 2 characters.")
    .max(160, "Product name cannot exceed 160 characters."),
  categoryId: z.string().trim().min(1, "Choose a category."),
  description: z
    .string()
    .trim()
    .max(5000, "Description cannot exceed 5000 characters.")
    .nullable(),
  price: z
    .number()
    .finite()
    .min(0.01, "Price must be greater than zero.")
    .max(9999999999.99, "Price is too high."),
  images: z
    .array(productImageSchema)
    .max(8, "A product can have at most 8 images."),
};

export const createSellerProductSchema = z
  .object({
    ...productFields,
    initialStock: z
      .number()
      .int()
      .min(0, "Initial stock cannot be negative.")
      .max(2147483647, "Initial stock is too high."),
  })
  .strict();

export const updateSellerProductSchema = z
  .object({
    name: productFields.name.optional(),
    categoryId: productFields.categoryId.optional(),
    description: productFields.description.optional(),
    price: productFields.price.optional(),
    images: productFields.images.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one product field to update.",
  });

export const adjustSellerInventorySchema = z
  .object({
    quantityDelta: z
      .number()
      .int()
      .min(-1000000)
      .max(1000000)
      .refine((value) => value !== 0, "Adjustment cannot be zero."),
    reason: z.enum(["RESTOCK", "CORRECTION", "RETURN"]),
    note: z
      .string()
      .trim()
      .max(500, "Notes cannot exceed 500 characters.")
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.reason !== "RESTOCK" && value.reason !== "RETURN") ||
      value.quantityDelta > 0,
    {
      message: "Restocks and returns must increase stock.",
      path: ["quantityDelta"],
    },
  );

export type SubmitSellerApplicationInput = z.infer<
  typeof submitSellerApplicationSchema
>;
export type CreateSellerProductInput = z.infer<
  typeof createSellerProductSchema
>;
export type UpdateSellerProductInput = z.infer<
  typeof updateSellerProductSchema
>;
export type AdjustSellerInventoryInput = z.infer<
  typeof adjustSellerInventorySchema
>;
