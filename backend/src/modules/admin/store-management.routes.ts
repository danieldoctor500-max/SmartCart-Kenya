
import { Router } from "express";

import { requireTrustedOrigin } from "../auth/origin.middleware.js";
import {
  activateStoreController,
  listStoresController,
  suspendStoreController,
} from "./store-management.controller.js";

const storeManagementRouter = Router();

// List stores with optional pagination, status filtering, and search.
storeManagementRouter.get("/", listStoresController);

// Activate a store.
storeManagementRouter.patch(
  "/:id/activate",
  requireTrustedOrigin,
  activateStoreController,
);

// Suspend an active store.
storeManagementRouter.patch(
  "/:id/suspend",
  requireTrustedOrigin,
  suspendStoreController,
);

export default storeManagementRouter;
