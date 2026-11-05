import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import { requireTrustedOrigin } from "../auth/origin.middleware.js";
import { requireRole } from "../auth/role.middleware.js";
import {
  getAddresses,
  makeAddressDefault,
  patchAddress,
  postAddress,
  removeAddress,
} from "./account.controller.js";

const accountRouter = Router();

accountRouter.use(requireAuth, requireRole("CUSTOMER"));
accountRouter.get("/addresses", getAddresses);
accountRouter.post("/addresses", requireTrustedOrigin, postAddress);
accountRouter.patch(
  "/addresses/:addressId/default",
  requireTrustedOrigin,
  makeAddressDefault,
);
accountRouter.patch(
  "/addresses/:addressId",
  requireTrustedOrigin,
  patchAddress,
);
accountRouter.delete(
  "/addresses/:addressId",
  requireTrustedOrigin,
  removeAddress,
);

export default accountRouter;
