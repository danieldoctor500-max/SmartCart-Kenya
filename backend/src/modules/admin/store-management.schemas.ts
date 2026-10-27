import { z } from "zod";

export const storeIdSchema = z.string()
  .trim()
  .min(1, "A store ID is required.")
  .max(100, "The store ID is invalid.");

export type StoreId = z.infer<typeof storeIdSchema>;
