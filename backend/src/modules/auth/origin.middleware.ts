
import type { RequestHandler } from "express";

import { env } from "../../config/env.js";

const allowedOrigin = new URL(env.FRONTEND_URL).origin;

/**
 * Protect browser-facing state-changing authentication endpoints.
 *
 * Requests must provide an Origin header that exactly matches
 * the configured frontend origin.
 */
export const requireTrustedOrigin: RequestHandler = (
  req,
  res,
  next,
) => {
  const origin = req.get("origin");

  if (!origin || origin !== allowedOrigin) {
    res.status(403).json({
      success: false,
      message: "This request origin is not allowed.",
    });
    return;
  }

  next();
};
