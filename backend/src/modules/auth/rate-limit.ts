
import rateLimit from "express-rate-limit";

type AuthRateLimitType = "login" | "registration";

interface AuthRateLimiterOptions {
  skipInTests?: boolean;
}

export function createAuthRateLimiter(
  type: AuthRateLimitType,
  options: AuthRateLimiterOptions = {},
) {
  const isRegistration = type === "registration";

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () =>
      options.skipInTests !== false &&
      process.env.NODE_ENV === "test",
    message: {
      success: false,
      message: isRegistration
        ? "Too many registration attempts. Please try again later."
        : "Too many login attempts. Please try again later.",
    },
  });
}
