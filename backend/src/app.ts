
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.middleware.js";
import healthRouter from "./modules/health/health.routes.js";
import authRouter from "./modules/auth/auth.routes.js";
import sellerRouter from "./modules/seller/seller.routes.js";
import adminRouter from "./modules/admin/admin.routes.js";
import catalogRouter from "./modules/catalog/catalog.routes.js";
import { cartRouter } from "./modules/cart/cart.routes.js";
import checkoutRouter from "./modules/checkout/checkout.routes.js";
import ordersRouter from "./modules/orders/orders.routes.js";
import accountRouter from "./modules/account/account.routes.js";

const app = express();
const frontendDistPath = fileURLToPath(
  new URL("../../frontend/dist/", import.meta.url),
);
const frontendIndexPath = fileURLToPath(
  new URL("../../frontend/dist/index.html", import.meta.url),
);
const frontendBuildAvailable = existsSync(frontendIndexPath);
const frontendStatic = frontendBuildAvailable
  ? express.static(frontendDistPath, {
      dotfiles: "deny",
      index: false,
    })
  : undefined;

function isApiRequest(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
}

app.disable("x-powered-by");

app.use(helmet());

app.use(
  cors({
    origin: new URL(env.FRONTEND_URL).origin,
    credentials: true,
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// API welcome endpoint.
app.get("/api/v1", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to the SmartCart Kenya API.",
    version: "1.0.0",
  });
});

// Health check endpoint.
app.use("/api/v1/health", healthRouter);

// Authentication endpoints.
app.use("/api/v1/auth", authRouter);

// Public product catalogue endpoints.
app.use("/api/v1/catalog", catalogRouter);

// Shopping cart endpoints.
app.use("/api/v1/cart", cartRouter);

// Customer checkout and order endpoints.
app.use("/api/v1/checkout", checkoutRouter);
app.use("/api/v1/orders", ordersRouter);
app.use("/api/v1/account", accountRouter);

// Seller application endpoints.
app.use("/api/v1/seller", sellerRouter);

// Admin endpoints.
app.use("/api/v1/admin", adminRouter);

// Keep API paths out of the frontend static file server.
app.use((req, res, next) => {
  if (isApiRequest(req.path) || !frontendStatic) {
    next();
    return;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(req.path);
  } catch (error) {
    next(error);
    return;
  }

  const pathSegments = decodedPath.split("/");
  if (
    pathSegments.some(
      (segment) =>
        segment.toLowerCase().endsWith(".map") ||
        /^\.env(?:$|\.)/i.test(segment),
    )
  ) {
    res.sendStatus(404);
    return;
  }

  frontendStatic(req, res, next);
});

// Serve the SPA for frontend navigation requests only.
app.use((req, res, next) => {
  if (isApiRequest(req.path)) {
    next();
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    next();
    return;
  }

  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(req.path);
  } catch (error) {
    next(error);
    return;
  }

  const acceptHeader = req.get("accept");
  const explicitlyAcceptsHtml = acceptHeader
    ?.split(",")
    .some(
      (mediaType) =>
        mediaType.split(";")[0].trim().toLowerCase() === "text/html",
    );
  const hasFileExtension = decodedPath
    .split("/")
    .some((segment) => segment.includes("."));

  if (!explicitlyAcceptsHtml || !req.accepts("html") || hasFileExtension) {
    next();
    return;
  }

  if (!frontendBuildAvailable) {
    res.status(503).type("text/plain").send("Frontend build is unavailable.");
    return;
  }

  res.sendFile(frontendIndexPath, (error) => {
    if (error) next(error);
  });
});

// Consistent JSON response for unknown routes.
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "The requested resource was not found.",
  });
});

// Keep this last so errors from earlier middleware and routes reach it.
app.use(errorHandler);

export default app;
