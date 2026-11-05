
import { z } from "zod";

export const storeIdSchema = z
  .string()
  .trim()
  .min(1, "A store ID is required.")
  .max(100, "The store ID is invalid.");

export type StoreId = z.infer<typeof storeIdSchema>;

export const listStoresSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z
      .enum(["INACTIVE", "ACTIVE", "SUSPENDED"])
      .optional(),
    search: z.preprocess(
      (value) => typeof value === "string" && value.trim() === ""
        ? undefined
        : value,
      z.string().trim().min(1).max(100).optional(),
    ),
  })
  .strict();

export type ListStoresInput = z.infer<typeof listStoresSchema>;
