
import type { NextFunction, Request, Response } from "express";
import { createHash } from "node:crypto";

import { env } from "../../config/env.js";
import { prisma } from "../../config/database.js";
import {
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from "./auth.schemas.js";
import { mergeGuestCart } from "../cart/cart.service.js";
import {
  AuthServiceError,
  loginCustomer,
  registerCustomer,
  updateUserProfile,
} from "./auth.service.js";

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const registrationAcknowledgementMessage =
  "If you have an account with this email, you can sign in.";

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

function sendRegistrationAcknowledgement(res: Response): void {
  res.status(202).json({
    success: true,
    message: registrationAcknowledgementMessage,
  });
}

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
    await registerCustomer(parsed.data);
    sendRegistrationAcknowledgement(res);
  } catch (error: unknown) {
    if (error instanceof AuthServiceError) {
      if (error.statusCode === 409) {
        sendRegistrationAcknowledgement(res);
        return;
      }

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

    const guestCookieName = "smartcart_guest";
    const guestSessionId: unknown = req.cookies?.[guestCookieName];

    let cartMerge = null;

    if (
      typeof guestSessionId === "string" &&
      /^[a-zA-Z0-9_-]{32,128}$/.test(guestSessionId)
    ) {
      try {
        cartMerge = await mergeGuestCart(
          result.user.id,
          guestSessionId,
        );
      } catch {
        const tokenHash = createHash("sha256")
          .update(result.token)
          .digest("hex");

        await prisma.session.deleteMany({
          where: { tokenHash },
        });

        console.error(
          "Login was not completed because guest-cart merging failed.",
        );

        res.status(500).json({
          success: false,
          message:
            "We could not safely merge your cart. Your guest cart has been preserved; please try logging in again.",
        });
        return;
      }
    }

    res.cookie(
      env.SESSION_COOKIE_NAME,
      result.token,
      sessionCookieOptions,
    );

    if (
      typeof guestSessionId === "string" &&
      /^[a-zA-Z0-9_-]{32,128}$/.test(guestSessionId)
    ) {
      res.clearCookie(
        guestCookieName,
        clearSessionCookieOptions,
      );
    }

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        user: result.user,
        expiresAt: result.expiresAt,
        cartMerge,
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
 * Update editable fields on the authenticated user's profile.
 * PATCH /api/v1/auth/me
 */
export async function updateCurrentUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = res.locals.auth;

  if (!auth?.user) {
    res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
    return;
  }

  const parsed = updateProfileSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Please check the profile details.",
      errors: parsed.error.flatten().fieldErrors,
    });
    return;
  }

  try {
    const user = await updateUserProfile(auth.user.id, parsed.data);
    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error: unknown) {
    next(error);
  }
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

    res.clearCookie(
      "smartcart_guest",
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
