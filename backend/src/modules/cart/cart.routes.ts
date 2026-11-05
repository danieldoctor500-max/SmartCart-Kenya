import { Router } from "express";
import { optionalAuth } from "../auth/auth.middleware.js";
import { requireTrustedOrigin } from "../auth/origin.middleware.js";
import {
  addCartItemController,
  clearCartController,
  getCartController,
  removeCartItemController,
  updateCartItemController,
} from "./cart.controller.js";

const cartRouter = Router();

cartRouter.get("/", optionalAuth, getCartController);
cartRouter.post(
  "/items",
  requireTrustedOrigin,
  optionalAuth,
  addCartItemController,
);
cartRouter.patch(
  "/items/:itemId",
  requireTrustedOrigin,
  optionalAuth,
  updateCartItemController,
);
cartRouter.delete(
  "/items/:itemId",
  requireTrustedOrigin,
  optionalAuth,
  removeCartItemController,
);
cartRouter.delete(
  "/",
  requireTrustedOrigin,
  optionalAuth,
  clearCartController,
);

export { cartRouter };
