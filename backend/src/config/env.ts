import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

if (process.env.SMARTCART_BROWSER_TEST !== "1") {
  dotenv.config({
    path: path.resolve(process.cwd(), "../.env"),
  });
}

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    BACKEND_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(3000),

    FRONTEND_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(5173),

    FRONTEND_URL: z.string().url().optional(),

    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    SESSION_COOKIE_NAME: z
      .string()
      .min(1)
      .default("smartcart_session"),

    MPESA_ENVIRONMENT: z.enum(["sandbox"]).default("sandbox"),
    MPESA_CONSUMER_KEY: z
      .string()
      .refine((value) => value.trim().length > 0, "MPESA_CONSUMER_KEY cannot be empty.")
      .optional(),
    MPESA_CONSUMER_SECRET: z
      .string()
      .refine((value) => value.trim().length > 0, "MPESA_CONSUMER_SECRET cannot be empty.")
      .optional(),
    MPESA_SHORTCODE: z
      .string()
      .refine((value) => value.trim().length > 0, "MPESA_SHORTCODE cannot be empty.")
      .optional(),
    MPESA_PASSKEY: z
      .string()
      .refine((value) => value.trim().length > 0, "MPESA_PASSKEY cannot be empty.")
      .optional(),
    MPESA_CALLBACK_URL: z.string().url().optional(),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV !== "production") {
      return;
    }

    if (!config.FRONTEND_URL) {
      context.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message: "FRONTEND_URL must be explicitly configured in production.",
      });
      return;
    }

    let frontendUrl: URL;
    try {
      frontendUrl = new URL(config.FRONTEND_URL);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message: "FRONTEND_URL must be a valid HTTPS origin.",
      });
      return;
    }

    if (frontendUrl.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message: "FRONTEND_URL must use HTTPS in production.",
      });
    }

    if (
      frontendUrl.pathname !== "/" ||
      config.FRONTEND_URL.includes("?") ||
      config.FRONTEND_URL.includes("#") ||
      frontendUrl.username !== "" ||
      frontendUrl.password !== ""
    ) {
      context.addIssue({
        code: "custom",
        path: ["FRONTEND_URL"],
        message:
          "FRONTEND_URL must be an origin without a path, query, fragment, or credentials.",
      });
    }
  });

const parsedEnv = envSchema.safeParse({
  ...process.env,
  BACKEND_PORT: process.env.PORT ?? process.env.BACKEND_PORT,
});

if (!parsedEnv.success) {
  console.error("Environment configuration is invalid.");
  console.error(parsedEnv.error.flatten().fieldErrors);
  throw new Error("Please correct the root .env configuration.");
}

export const env = {
  ...parsedEnv.data,
  PORT: parsedEnv.data.BACKEND_PORT,
  FRONTEND_URL:
    parsedEnv.data.FRONTEND_URL ??
    `http://localhost:${parsedEnv.data.FRONTEND_PORT}`,
};
