import dotenv from "dotenv";
import path from "node:path";
import { z } from "zod";

dotenv.config({
  path: path.resolve(process.cwd(), "../.env"),
});

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  BACKEND_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  FRONTEND_PORT: z.coerce.number().int().min(1).max(65535).default(5173),
  FRONTEND_URL: z.string().url().optional(),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_COOKIE_NAME: z.string().min(1).default("smartcart_session"),
});

const parsedEnv = envSchema.safeParse(process.env);

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