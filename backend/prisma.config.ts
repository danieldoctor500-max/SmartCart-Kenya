import dotenv from "dotenv";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

if (process.env.SMARTCART_BROWSER_TEST !== "1") {
  dotenv.config({
    path: path.resolve(process.cwd(), "../.env")
  });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: env("DATABASE_URL")
  }
});
