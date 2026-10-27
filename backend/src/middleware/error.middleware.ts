
import type { ErrorRequestHandler } from "express";

function getErrorType(error: unknown): string | undefined {
  if (
    typeof error !== "object" ||
    error === null ||
    !("type" in error)
  ) {
    return undefined;
  }

  return typeof error.type === "string" ? error.type : undefined;
}

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const errorType = getErrorType(error);

  if (errorType === "entity.parse.failed") {
    res.status(400).json({
      success: false,
      message: "The request body contains invalid JSON.",
    });
    return;
  }

  if (errorType === "entity.too.large") {
    res.status(413).json({
      success: false,
      message: "The request body exceeds the allowed size.",
    });
    return;
  }

  // Do not expose internal error details to clients.
  console.error("Unhandled request error.");

  res.status(500).json({
    success: false,
    message: "An unexpected error occurred. Please try again later.",
  });
};
