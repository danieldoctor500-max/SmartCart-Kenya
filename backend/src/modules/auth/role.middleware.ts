
import type { RequestHandler } from "express";
import type { Role } from "../../generated/prisma/client.js";

export const requireRole = (
  ...allowedRoles: Role[]
): RequestHandler => {
  return (_req, res, next) => {
    const auth = res.locals.auth;

    if (!auth) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const hasRequiredRole = auth.user.roles.some(({ role }) =>
      allowedRoles.includes(role),
    );

    if (!hasRequiredRole) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action.",
      });
      return;
    }

    next();
  };
};
