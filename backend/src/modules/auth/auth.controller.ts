
import type { Request, Response } from "express";
import { createHash } from "node:crypto";

import { env } from "../../config/env.js";
import { prisma } from "../../config/database.js";
import { loginSchema, registerSchema } from "./auth.schemas.js";
import {
  AuthServiceError,
  loginCustomer,
  registerCustomer,
} from "./auth.service.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const sessionCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_DURATION_MS,
};

const clearSessionCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

/**
 * Register a new customer account.
 * POST /api/v1/auth/register
 */
export async function register(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Please check the registration details.",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = await registerCustomer(parsed.data);

    res.status(201).json({
      success: true,
      message: "Your SmartCart Kenya account has been created.",
      data: { user },
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error("Registration failed due to an internal error.");

    res.status(500).json({
      success: false,
      message: "We could not complete registration. Please try again.",
    });
  }
}

/**
 * Authenticate a customer and issue a session cookie.
 * POST /api/v1/auth/login
 */
export async function login(
  req: Request,
  res: Response,
): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Please check your login details.",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const result = await loginCustomer(parsed.data, {
      userAgent: req.get("user-agent") ?? null,
      ipAddress: req.ip ?? null,
    });

    res.cookie(
      env.SESSION_COOKIE_NAME,
      result.token,
      sessionCookieOptions,
    );

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        user: result.user,
        expiresAt: result.expiresAt,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    console.error("Login failed due to an internal error.");

    res.status(500).json({
      success: false,
      message: "We could not complete login. Please try again.",
    });
  }
}

/**
 * Return the authenticated customer's profile.
 * GET /api/v1/auth/me
 *
 * The requireAuth middleware must run before this controller.
 */
export async function currentUser(
  _req: Request,
  res: Response,
): Promise<void> {
  const auth = res.locals.auth;

  if (!auth?.user) {
    res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
    return;
  }

  res.status(200).json({
    success: true,
    data: {
      user: auth.user,
    },
  });
}

/**
 * Revoke the current server-side session and clear its cookie.
 * POST /api/v1/auth/logout
 */
export async function logout(
  req: Request,
  res: Response,
): Promise<void> {
  const token: unknown = req.cookies?.[env.SESSION_COOKIE_NAME];

  try {
    if (typeof token === "string" && token.length > 0) {
      const tokenHash = createHash("sha256")
        .update(token)
        .digest("hex");

      await prisma.session.deleteMany({
        where: { tokenHash },
      });
    }

    res.clearCookie(
      env.SESSION_COOKIE_NAME,
      clearSessionCookieOptions,
    );

    res.status(200).json({
      success: true,
      message: "You have been logged out.",
    });
  } catch {
    console.error("Logout failed due to an internal error.");

    res.status(500).json({
      success: false,
      message: "We could not complete logout. Please try again.",
    });
  }
}
