import type { RequestHandler } from "express";

import { getAdminDashboardSummary } from "./dashboard-summary.service.js";

export const getDashboardSummary: RequestHandler = async (
  _req,
  res,
  next,
) => {
  try {
    const summary = await getAdminDashboardSummary();
    res.status(200).json({
      success: true,
      data: summary,
    });
  } catch (error: unknown) {
    next(error);
  }
};
