
import { createHash } from "node:crypto";
import type {
  Request,
  RequestHandler,
  Response,
} from "express";

import { env } from "../../config/env.js";
import { prisma } from "../../config/database.js";

type AuthResolution = "missing" | "invalid" | "authenticated";

async function resolveAuth(
  req: Request,
  res: Response,
): Promise<AuthResolution> {
  const token: unknown = req.cookies?.[env.SESSION_COOKIE_NAME];

  if (token === undefined) {
    return "missing";
  }

  if (typeof token !== "string" || token.length === 0) {
    return "invalid";
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          status: true,
          roles: {
            select: { role: true },
          },
        },
      },
    },
  });

  if (!session) {
    return "invalid";
  }

  if (
    session.expiresAt.getTime() <= Date.now() ||
    session.user.status !== "ACTIVE"
  ) {
    await prisma.session.deleteMany({
      where: { id: session.id },
    });

    return "invalid";
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  });

  res.locals.auth = {
    sessionId: session.id,
    user: session.user,
  };

  return "authenticated";
}

function sendAuthenticationError(
  res: Response,
  resolution: Exclude<AuthResolution, "authenticated">,
): void {
  res.status(401).json({
    success: false,
    message:
      resolution === "missing"
        ? "Authentication is required."
        : "Your session is invalid or has expired.",
  });
}

export const requireAuth: RequestHandler = async (req, res, next) => {
  let resolution: AuthResolution;

  try {
    resolution = await resolveAuth(req, res);
  } catch (error) {
    next(error);
    return;
  }

  if (resolution !== "authenticated") {
    sendAuthenticationError(res, resolution);
    return;
  }

  // Keep next() outside the try block so downstream errors
  // are not caught by this middleware's database error handler.
  next();
};

export const optionalAuth: RequestHandler = async (req, res, next) => {
  let resolution: AuthResolution;

  try {
    resolution = await resolveAuth(req, res);
  } catch (error) {
    next(error);
    return;
  }

  if (resolution === "invalid") {
    sendAuthenticationError(res, resolution);
    return;
  }

  next();
};
