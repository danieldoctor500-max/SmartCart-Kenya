
import type { RequestHandler, Response } from "express";

import {
  adjustSellerInventorySchema,
  createSellerProductSchema,
  submitSellerApplicationSchema,
  updateSellerProductSchema,
} from "./seller.schemas.js";
import {
  adjustSellerInventory,
  createSellerProduct,
  getSellerOrder,
  getSellerProduct,
  getMySellerApplication,
  listSellerCategories,
  listSellerOrders,
  listSellerProducts,
  publishSellerProduct,
  SellerApplicationError,
  SellerProductError,
  submitSellerApplication,
  updateSellerProduct,
} from "./seller.service.js";
import {
  orderIdSchema,
  ordersQuerySchema,
} from "../orders/orders.schemas.js";

export const submitApplication: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const auth = res.locals.auth;

    if (!auth) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const parsed = submitSellerApplicationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid seller application details.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const application = await submitSellerApplication(
      auth.user.id,
      parsed.data,
    );

    res.status(201).json({
      success: true,
      message: "Seller application submitted successfully.",
      data: application,
    });
  } catch (error: unknown) {
    if (error instanceof SellerApplicationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
};

export const myApplication: RequestHandler = async (
  _req,
  res,
  next,
) => {
  try {
    const auth = res.locals.auth;

    if (!auth) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const application = await getMySellerApplication(auth.user.id);

    if (!application) {
      res.status(404).json({
        success: false,
        message: "No seller application was found for this account.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error: unknown) {
    next(error);
  }
};

function requireSellerUserId(res: Response): string | null {
  const userId = res.locals.auth?.user.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
    return null;
  }

  return userId;
}

function sendSellerError(res: Response, error: unknown) {
  if (
    error instanceof SellerApplicationError ||
    error instanceof SellerProductError
  ) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return true;
  }

  return false;
}

export const sellerCategories: RequestHandler = async (
  _req,
  res,
  next,
) => {
  const userId = requireSellerUserId(res);
  if (!userId) return;

  try {
    const categories = await listSellerCategories(userId);
    res.status(200).json({ success: true, data: categories });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};

export const sellerProducts: RequestHandler = async (
  _req,
  res,
  next,
) => {
  const userId = requireSellerUserId(res);
  if (!userId) return;

  try {
    const products = await listSellerProducts(userId);
    res.status(200).json({ success: true, data: products });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};

export const sellerOrders: RequestHandler = async (req, res, next) => {
  const userId = requireSellerUserId(res);
  if (!userId) return;
  const parsed = ordersQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid order query parameters.",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await listSellerOrders(
      userId,
      parsed.data.page,
      parsed.data.limit,
    );
    res.status(200).json({ success: true, ...result });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};

export const sellerOrder: RequestHandler = async (req, res, next) => {
  const userId = requireSellerUserId(res);
  if (!userId) return;
  const parsedId = orderIdSchema.safeParse(req.params.sellerOrderId);

  if (!parsedId.success) {
    res.status(400).json({
      success: false,
      message: "A valid order ID is required.",
    });
    return;
  }

  try {
    const order = await getSellerOrder(userId, parsedId.data);
    res.status(200).json({ success: true, data: order });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};

export const sellerProduct: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = requireSellerUserId(res);
  if (!userId) return;
  const productId = req.params.productId;

  if (typeof productId !== "string") {
    res.status(400).json({
      success: false,
      message: "A valid product ID is required.",
    });
    return;
  }

  try {
    const product = await getSellerProduct(
      userId,
      productId,
    );
    res.status(200).json({ success: true, data: product });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};

export const createProduct: RequestHandler = async (
  req,
  res,
  next,
) => {
  const parsed = createSellerProductSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid product details.",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const userId = requireSellerUserId(res);
  if (!userId) return;

  try {
    const product = await createSellerProduct(
      userId,
      parsed.data,
    );
    res.status(201).json({
      success: true,
      message: "Product created as a draft. Add available stock before publishing it.",
      data: product,
    });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};

export const publishProduct: RequestHandler = async (
  req,
  res,
  next,
) => {
  const userId = requireSellerUserId(res);
  if (!userId) return;
  const productId = req.params.productId;

  if (typeof productId !== "string") {
    res.status(400).json({
      success: false,
      message: "A valid product ID is required.",
    });
    return;
  }

  try {
    const product = await publishSellerProduct(userId, productId);
    res.status(200).json({
      success: true,
      message: "Product published successfully.",
      data: product,
    });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};

export const updateProduct: RequestHandler = async (
  req,
  res,
  next,
) => {
  const parsed = updateSellerProductSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid product details.",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const userId = requireSellerUserId(res);
  if (!userId) return;
  const productId = req.params.productId;

  if (typeof productId !== "string") {
    res.status(400).json({
      success: false,
      message: "A valid product ID is required.",
    });
    return;
  }

  try {
    const product = await updateSellerProduct(
      userId,
      productId,
      parsed.data,
    );
    res.status(200).json({
      success: true,
      message: "Product updated successfully.",
      data: product,
    });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};

export const adjustInventory: RequestHandler = async (
  req,
  res,
  next,
) => {
  const parsed = adjustSellerInventorySchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid inventory adjustment.",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  const userId = requireSellerUserId(res);
  if (!userId) return;
  const productId = req.params.productId;

  if (typeof productId !== "string") {
    res.status(400).json({
      success: false,
      message: "A valid product ID is required.",
    });
    return;
  }

  try {
    const product = await adjustSellerInventory(
      userId,
      productId,
      parsed.data,
    );
    res.status(200).json({
      success: true,
      message: "Inventory adjusted successfully.",
      data: product,
    });
  } catch (error: unknown) {
    if (sendSellerError(res, error)) return;
    next(error);
  }
};
