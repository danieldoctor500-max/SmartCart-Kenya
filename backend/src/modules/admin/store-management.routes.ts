import { Router } from "express";

import { requireTrustedOrigin } from "../auth/origin.middleware.js";
import {
  activateStoreController,
  suspendStoreController,
} from "./store-management.controller.js";

const storeManagementRouter = Router();

storeManagementRouter.patch(
  "/:id/activate",
  requireTrustedOrigin,
  activateStoreController,
);

storeManagementRouter.patch(
  "/:id/suspend",
  requireTrustedOrigin,
  suspendStoreController,
);

export default storeManagementRouter;
