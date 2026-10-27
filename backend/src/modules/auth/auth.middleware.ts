
import { createHash } from "node:crypto";
import type { RequestHandler } from "express";

import { env } from "../../config/env.js";
import { prisma } from "../../config/database.js";

export const requireAuth: RequestHandler = async (req, res, next) => {
  const token: unknown = req.cookies?.[env.SESSION_COOKIE_NAME];

  if (typeof token !== "string" || token.length === 0) {
    res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
    return;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
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
      res.status(401).json({
        success: false,
        message: "Your session is invalid or has expired.",
      });
      return;
    }

    if (
      session.expiresAt.getTime() <= Date.now() ||
      session.user.status !== "ACTIVE"
    ) {
      await prisma.session.deleteMany({
        where: { id: session.id },
      });

      res.status(401).json({
        success: false,
        message: "Your session is invalid or has expired.",
      });
      return;
    }

    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });

    res.locals.auth = {
      sessionId: session.id,
      user: session.user,
    };
  } catch (error) {
    next(error);
    return;
  }

  // Keep next() outside the try block so downstream errors
  // are not caught by this middleware's database error handler.
  next();
};
