
import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireTrustedOrigin } from "../auth/origin.middleware.js";
import { requireRole } from "../auth/role.middleware.js";

import {
  adjustInventory,
  createProduct,
  myApplication,
  publishProduct,
  sellerCategories,
  sellerOrder,
  sellerOrders,
  sellerProduct,
  sellerProducts,
  submitApplication,
  updateProduct,
} from "./seller.controller.js";

const sellerRouter = Router();

// Submit a seller application.
sellerRouter.post(
  "/applications",
  requireTrustedOrigin,
  requireAuth,
  submitApplication,
);

// Retrieve the authenticated user's seller application.
sellerRouter.get(
  "/applications/me",
  requireAuth,
  myApplication,
);

sellerRouter.get(
  "/categories",
  requireAuth,
  requireRole("SELLER"),
  sellerCategories,
);

sellerRouter.get(
  "/products",
  requireAuth,
  requireRole("SELLER"),
  sellerProducts,
);

sellerRouter.get(
  "/orders",
  requireAuth,
  requireRole("SELLER"),
  sellerOrders,
);

sellerRouter.get(
  "/orders/:sellerOrderId",
  requireAuth,
  requireRole("SELLER"),
  sellerOrder,
);

sellerRouter.post(
  "/products",
  requireTrustedOrigin,
  requireAuth,
  requireRole("SELLER"),
  createProduct,
);

sellerRouter.get(
  "/products/:productId",
  requireAuth,
  requireRole("SELLER"),
  sellerProduct,
);

sellerRouter.patch(
  "/products/:productId/publish",
  requireTrustedOrigin,
  requireAuth,
  requireRole("SELLER"),
  publishProduct,
);

sellerRouter.patch(
  "/products/:productId",
  requireTrustedOrigin,
  requireAuth,
  requireRole("SELLER"),
  updateProduct,
);

sellerRouter.patch(
  "/products/:productId/inventory",
  requireTrustedOrigin,
  requireAuth,
  requireRole("SELLER"),
  adjustInventory,
);

export default sellerRouter;
