import { z } from "zod";

const addressFields = {
  recipientName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  county: z.string().trim().min(2).max(100),
  town: z.string().trim().min(1).max(100),
  addressLine: z.string().trim().min(4).max(300),
  deliveryInstructions: z.string().trim().max(500).nullable().optional(),
};

export const createAddressSchema = z.object(addressFields).strict();

export const updateAddressSchema = z
  .object({
    recipientName: addressFields.recipientName.optional(),
    phone: addressFields.phone.optional(),
    county: addressFields.county.optional(),
    town: addressFields.town.optional(),
    addressLine: addressFields.addressLine.optional(),
    deliveryInstructions: addressFields.deliveryInstructions,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one address field to update.",
  });

export const addressIdSchema = z.string().trim().min(1).max(128);

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
