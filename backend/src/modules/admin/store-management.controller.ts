
import type { RequestHandler } from "express";

import {
  listStoresSchema,
  storeIdSchema,
} from "./store-management.schemas.js";

import {
  activateStore,
  listStores,
  StoreManagementError,
  suspendStore,
} from "./store-management.service.js";

function getStoreId(value: unknown) {
  return storeIdSchema.safeParse(value);
}

export const listStoresController: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const parsed = listStoresSchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid store filters.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const result = await listStores(parsed.data);

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const activateStoreController: RequestHandler = async (
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

    const parsedId = getStoreId(req.params.id);

    if (!parsedId.success) {
      res.status(400).json({
        success: false,
        message: "A valid store ID is required.",
      });
      return;
    }

    const result = await activateStore(
      parsedId.data,
      auth.user.id,
    );

    res.status(200).json({
      success: true,
      message: "Store activated successfully.",
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof StoreManagementError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
};

export const suspendStoreController: RequestHandler = async (
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

    const parsedId = getStoreId(req.params.id);

    if (!parsedId.success) {
      res.status(400).json({
        success: false,
        message: "A valid store ID is required.",
      });
      return;
    }

    const result = await suspendStore(
      parsedId.data,
      auth.user.id,
    );

    res.status(200).json({
      success: true,
      message: "Store suspended successfully.",
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof StoreManagementError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
};
