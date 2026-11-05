import { z } from "zod";

const location = {
  county: z.string().trim().min(2).max(100),
  town: z.string().trim().min(1).max(100),
};

const fee = z.number().finite().min(0.01).max(9999999999.99);

export const createDeliveryRateSchema = z
  .object({
    ...location,
    fee,
    isActive: z.boolean().default(true),
  })
  .strict();

export const updateDeliveryRateSchema = z
  .object({
    county: location.county.optional(),
    town: location.town.optional(),
    fee: fee.optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one delivery-rate field to update.",
  });

export const deliveryRateIdSchema = z.string().trim().min(1).max(128);

export const listDeliveryRatesSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.preprocess(
    (value) => typeof value === "string" && value.trim() === ""
      ? undefined
      : value,
    z.string().trim().min(1).max(100).optional(),
  ),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
}).strict();

export const listDeliveryRateAuditSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export type CreateDeliveryRateInput = z.infer<
  typeof createDeliveryRateSchema
>;
export type UpdateDeliveryRateInput = z.infer<
  typeof updateDeliveryRateSchema
>;
export type ListDeliveryRatesInput = z.infer<
  typeof listDeliveryRatesSchema
>;
export type ListDeliveryRateAuditInput = z.infer<
  typeof listDeliveryRateAuditSchema
>;
