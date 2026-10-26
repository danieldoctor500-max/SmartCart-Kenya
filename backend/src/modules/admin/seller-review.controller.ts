
import type { RequestHandler } from "express";

import {
  listSellerApplicationsSchema,
  rejectSellerApplicationSchema,
} from "./seller-review.schemas.js";

import {
  approveSellerApplication,
  listSellerApplications,
  rejectSellerApplication,
  SellerReviewError,
} from "./seller-review.service.js";

export const listApplications: RequestHandler = async (req, res, next) => {
  try {
    const parsed = listSellerApplicationsSchema.safeParse(req.query);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid application filters.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const result = await listSellerApplications(parsed.data);

    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error: unknown) {
    next(error);
  }
};

export const approveApplication: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const auth = res.locals.auth;

    if (!auth) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const applicationId = req.params.id;

    if (!applicationId || Array.isArray(applicationId)) {
      res.status(400).json({
        success: false,
        message: "A valid application ID is required.",
      });
      return;
    }

    const result = await approveSellerApplication(
      applicationId,
      auth.user.id,
    );

    res.status(200).json({
      success: true,
      message: "Seller application approved successfully.",
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof SellerReviewError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
};

export const rejectApplication: RequestHandler = async (
  req,
  res,
  next,
) => {
  try {
    const auth = res.locals.auth;

    if (!auth) {
      res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
      return;
    }

    const applicationId = req.params.id;

    if (!applicationId || Array.isArray(applicationId)) {
      res.status(400).json({
        success: false,
        message: "A valid application ID is required.",
      });
      return;
    }

    const parsed = rejectSellerApplicationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "A valid rejection reason is required.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const result = await rejectSellerApplication(
      applicationId,
      auth.user.id,
      parsed.data,
    );

    res.status(200).json({
      success: true,
      message: "Seller application rejected.",
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof SellerReviewError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
};
