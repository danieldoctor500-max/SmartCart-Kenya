
import { Router } from "express";
import { prisma } from "../../config/database.js";

const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      message: "SmartCart Kenya API is healthy.",
      data: {
        api: "ok",
        database: "connected",
        timestamp: new Date().toISOString(),
      },
    });
  } catch {
    res.status(503).json({
      success: false,
      message: "The API is running, but the database is unavailable.",
      data: {
        api: "ok",
        database: "disconnected",
        timestamp: new Date().toISOString(),
      },
    });
  }
});

export default healthRouter;
