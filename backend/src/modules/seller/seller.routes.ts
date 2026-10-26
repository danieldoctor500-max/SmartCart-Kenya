
import { Router } from "express";

import { requireAuth } from "../auth/auth.middleware.js";
import { requireTrustedOrigin } from "../auth/origin.middleware.js";

import {
  myApplication,
  submitApplication,
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

export default sellerRouter;
