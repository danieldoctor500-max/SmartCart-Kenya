import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

import {
  createDeliveryRateSchema,
  deliveryRateIdSchema,
  listDeliveryRateAuditSchema,
  listDeliveryRatesSchema,
  updateDeliveryRateSchema,
} from "./delivery-rates.schemas.js";
import {
  DeliveryRateError,
  listDeliveryRateAudit,
  listDeliveryRates,
  saveDeliveryRate,
  updateDeliveryRate,
} from "./delivery-rates.service.js";

function handleError(
  error: unknown,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof DeliveryRateError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: "Invalid delivery-rate details.",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  next(error);
}

export async function getDeliveryRates(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsed = listDeliveryRatesSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid delivery-rate filters.",
        errors: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const result = await listDeliveryRates(parsed.data);
    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function getDeliveryRateAudit(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const parsedId = deliveryRateIdSchema.safeParse(req.params.rateId);
    const parsedQuery = listDeliveryRateAuditSchema.safeParse(req.query);
    if (!parsedId.success || !parsedQuery.success) {
      const issues = [
        ...(!parsedId.success ? parsedId.error.issues : []),
        ...(!parsedQuery.success ? parsedQuery.error.issues : []),
      ];
      res.status(400).json({
        success: false,
        message: "Invalid delivery-rate audit filters.",
        errors: issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
      return;
    }

    const result = await listDeliveryRateAudit(
      parsedId.data,
      parsedQuery.data,
    );
    res.status(200).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function createOrReplaceDeliveryRate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = res.locals.auth;
  if (!auth) {
    res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
    return;
  }

  const parsed = createDeliveryRateSchema.safeParse(req.body);

  if (!parsed.success) {
    handleError(parsed.error, res, next);
    return;
  }

  try {
    const rate = await saveDeliveryRate(
      parsed.data,
      auth.user.id,
    );
    res.status(200).json({
      success: true,
      message: "Delivery rate saved.",
      data: rate,
    });
  } catch (error) {
    handleError(error, res, next);
  }
}

export async function patchDeliveryRate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = res.locals.auth;
  if (!auth) {
    res.status(401).json({
      success: false,
      message: "Authentication is required.",
    });
    return;
  }

  const parsedId = deliveryRateIdSchema.safeParse(req.params.rateId);
  const parsedBody = updateDeliveryRateSchema.safeParse(req.body);

  if (!parsedId.success) {
    handleError(parsedId.error, res, next);
    return;
  }

  if (!parsedBody.success) {
    handleError(parsedBody.error, res, next);
    return;
  }

  try {
    const rate = await updateDeliveryRate(
      parsedId.data,
      parsedBody.data,
      auth.user.id,
    );
    res.status(200).json({
      success: true,
      message: "Delivery rate updated.",
      data: rate,
    });
  } catch (error) {
    handleError(error, res, next);
  }
}
