
import type { RequestHandler } from "express";

import { submitSellerApplicationSchema } from "./seller.schemas.js";
import {
  getMySellerApplication,
  SellerApplicationError,
  submitSellerApplication,
} from "./seller.service.js";

export const submitApplication: RequestHandler = async (
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

    const parsed = submitSellerApplicationSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid seller application details.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const application = await submitSellerApplication(
      auth.user.id,
      parsed.data,
    );

    res.status(201).json({
      success: true,
      message: "Seller application submitted successfully.",
      data: application,
    });
  } catch (error: unknown) {
    if (error instanceof SellerApplicationError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
};

export const myApplication: RequestHandler = async (
  _req,
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

    const application = await getMySellerApplication(auth.user.id);

    if (!application) {
      res.status(404).json({
        success: false,
        message: "No seller application was found for this account.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error: unknown) {
    next(error);
  }
};
