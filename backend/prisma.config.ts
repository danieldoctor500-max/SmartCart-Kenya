import dotenv from "dotenv";
import path from "node:path";
import { defineConfig, env } from "prisma/config";

if (process.env.SMARTCART_BROWSER_TEST !== "1") {
  dotenv.config({
    path: path.resolve(process.cwd(), "../.env")
  });
}

const datasourceUrl =
  process.env.DIRECT_URL !== undefined
    ? env("DIRECT_URL")
    : env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: datasourceUrl
  }
});
