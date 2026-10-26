
import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
  currentUser,
  login,
  logout,
  register,
} from "./auth.controller.js";
import { requireAuth } from "./auth.middleware.js";

const authRouter = Router();

const registrationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many registration attempts. Please try again later.",
  },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many login attempts. Please try again later.",
  },
});

authRouter.post("/register", registrationLimiter, register);
authRouter.post("/login", loginLimiter, login);

authRouter.get("/me", requireAuth, currentUser);
authRouter.post("/logout", logout);

export default authRouter;
