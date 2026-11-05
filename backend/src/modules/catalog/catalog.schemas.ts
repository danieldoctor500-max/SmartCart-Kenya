import { z } from "zod";

const optionalPrice = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().finite().min(0).max(999999999).optional(),
);

export const catalogQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(12),
    search: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
    sort: z
      .enum(["newest", "price_asc", "price_desc", "name_asc"])
      .default("newest"),
  })
  .strict()
  .refine(
    (query) =>
      query.minPrice === undefined ||
      query.maxPrice === undefined ||
      query.minPrice <= query.maxPrice,
    {
      message: "Minimum price cannot exceed maximum price.",
      path: ["minPrice"],
    },
  );

export type CatalogQuery = z.infer<typeof catalogQuerySchema>;
