
import { prisma } from "../src/config/database.js";

try {
  await prisma.$connect();

  const result = await prisma.$queryRaw<
    Array<{ database_time: Date }>
  >`SELECT NOW() AS database_time`;

  console.log("Database connection successful.");
  console.log("Database server time:", result[0]?.database_time);
} catch (error) {
  console.error("Database connection failed:", error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
