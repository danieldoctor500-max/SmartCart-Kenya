
import { Router } from "express";

import {
  currentUser,
  login,
  logout,
  register,
} from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";
import { requireTrustedOrigin } from "./origin.middleware.js";
import { createAuthRateLimiter } from "./rate-limit.js";

const authRouter = Router();

const registrationLimiter = createAuthRateLimiter("registration");
const loginLimiter = createAuthRateLimiter("login");

authRouter.post(
  "/register",
  requireTrustedOrigin,
  registrationLimiter,
  register,
);

authRouter.post(
  "/login",
  requireTrustedOrigin,
  loginLimiter,
  login,
);

authRouter.get("/me", requireAuth, currentUser);

authRouter.post("/logout", requireTrustedOrigin, logout);

export default authRouter;
