import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireTrustedOrigin } from "../auth/origin.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import {
  getCheckoutAddresses,
  getCheckoutQuoteController,
  getDeliveryOptions,
  postCheckout,
} from "./checkout.controller.js";

const checkoutRouter = Router();

checkoutRouter.use(requireAuth, requireRole("CUSTOMER"));
checkoutRouter.get("/addresses", getCheckoutAddresses);
checkoutRouter.get("/delivery-options", getDeliveryOptions);
checkoutRouter.get("/quote", getCheckoutQuoteController);
checkoutRouter.post("/", requireTrustedOrigin, postCheckout);

export default checkoutRouter;
