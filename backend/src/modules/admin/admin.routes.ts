
import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireTrustedOrigin } from "../auth/origin.middleware.js";
import { requireRole } from "../auth/role.middleware.js";

import {
  approveApplication,
  listApplications,
  rejectApplication,
} from "./seller-review.controller.js";
import { getDashboardSummary } from "./dashboard-summary.controller.js";

import storeManagementRouter from "./store-management.routes.js";
import deliveryRatesRouter from "../delivery-rates/delivery-rates.routes.js";

const adminRouter = Router();

// All routes below require an authenticated administrator.
adminRouter.use(requireAuth, requireRole("ADMIN"));

adminRouter.use("/stores", storeManagementRouter);
adminRouter.use("/delivery-rates", deliveryRatesRouter);

adminRouter.get("/dashboard/summary", getDashboardSummary);

// List seller applications. Defaults to PENDING.
adminRouter.get("/seller-applications", listApplications);

// Decisions change account permissions and therefore require a trusted origin.
adminRouter.patch(
  "/seller-applications/:id/approve",
  requireTrustedOrigin,
  approveApplication,
);

adminRouter.patch(
  "/seller-applications/:id/reject",
  requireTrustedOrigin,
  rejectApplication,
);

export default adminRouter;
