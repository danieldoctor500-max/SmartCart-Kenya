import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

import {
  getCustomerOrder,
  listCustomerOrders,
  OrderAccessError,
} from "./orders.service.js";
import { orderIdSchema, ordersQuerySchema } from "./orders.schemas.js";

export async function getOrders(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = res.locals.auth;
  if (!auth) {
    res.status(401).json({ success: false, message: "Authentication is required." });
    return;
  }

  const parsed = ordersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Invalid order query parameters.",
      errors: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  try {
    const result = await listCustomerOrders(
      auth.user.id,
      parsed.data.page,
      parsed.data.limit,
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
}

export async function getOrder(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = res.locals.auth;
  if (!auth) {
    res.status(401).json({ success: false, message: "Authentication is required." });
    return;
  }

  const parsedId = orderIdSchema.safeParse(req.params.orderId);
  if (!parsedId.success) {
    res.status(400).json({
      success: false,
      message: "A valid order ID is required.",
    });
    return;
  }

  try {
    const order = await getCustomerOrder(
      auth.user.id,
      parsedId.data,
    );
    res.status(200).json({ success: true, data: order });
  } catch (error) {
    if (error instanceof OrderAccessError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
      return;
    }

    next(error);
  }
}
