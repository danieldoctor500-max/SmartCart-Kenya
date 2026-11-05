
import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { catalogQuerySchema } from "./catalog.schemas.js";
import {
  getPublicProductBySlug,
  getPublicProductByStoreAndSlug,
  listCatalogCategories,
  listCatalogProducts,
} from "./catalog.service.js";

export async function getCatalogProducts(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = catalogQuerySchema.parse(req.query);
    const result = await listCatalogProducts(query);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        message: "Invalid catalogue query parameters.",
        errors: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    next(error);
  }
}

export async function getCatalogProductBySlug(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const slug = req.params.slug;

    if (typeof slug !== "string" || slug.trim().length === 0) {
      res.status(400).json({
        success: false,
        message: "A valid product slug is required.",
      });
      return;
    }

    const result = await getPublicProductBySlug(slug);

    if (result.kind === "not_found") {
      res.status(404).json({
        success: false,
        message: "Product not found.",
      });
      return;
    }

    if (result.kind === "ambiguous") {
      res.status(409).json({
        success: false,
        message:
          "This product slug is shared by multiple stores. Use a store-specific product URL.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCatalogProductByStoreAndSlug(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const { storeSlug, productSlug } = req.params;

    if (
      typeof storeSlug !== "string" ||
      storeSlug.trim().length === 0 ||
      typeof productSlug !== "string" ||
      productSlug.trim().length === 0
    ) {
      res.status(400).json({
        success: false,
        message: "A valid store and product slug are required.",
      });
      return;
    }

    const result = await getPublicProductByStoreAndSlug(
      storeSlug,
      productSlug,
    );

    if (result.kind === "not_found") {
      res.status(404).json({
        success: false,
        message: "Product not found.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCatalogCategories(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const categories = await listCatalogCategories();

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
}
