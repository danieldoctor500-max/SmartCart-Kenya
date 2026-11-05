
import { z } from "zod";

export const listSellerApplicationsSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "SUSPENDED"])
    .default("PENDING"),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.preprocess(
    (value) => typeof value === "string" ? value.trim() || undefined : value,
    z.string().max(100, "Search cannot exceed 100 characters.").optional(),
  ),
}).strict();

export const rejectSellerApplicationSchema = z.object({
  reason: z.string()
    .trim()
    .min(5, "The rejection reason must contain at least 5 characters.")
    .max(500, "The rejection reason cannot exceed 500 characters."),
}).strict();

export type ListSellerApplicationsInput = z.infer<
  typeof listSellerApplicationsSchema
>;

export type RejectSellerApplicationInput = z.infer<
  typeof rejectSellerApplicationSchema
>;
