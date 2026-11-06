

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

export const prisma = new PrismaClient({
  adapter,
});
