import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import {
  CheckoutError,
  createCheckout,
  getCheckoutDeliveryOptions,
  getCheckoutQuote,
  listCheckoutAddresses,
} from "./checkout.service.js";
import {
  checkoutQuoteQuerySchema,
  createCheckoutSchema,
} from "./checkout.schemas.js";

function handleCheckoutError(
  error: unknown,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof CheckoutError) {
    res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Please check the submitted data.",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  next(error);
}

export async function getCheckoutAddresses(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = res.locals.auth;
  if (!auth) {
    res.status(401).json({ success: false, message: "Authentication is required." });
    return;
  }

  try {
    res.status(200).json({
      success: true,
      data: await listCheckoutAddresses(auth.user.id),
    });
  } catch (error) {
    next(error);
  }
}

export async function getDeliveryOptions(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    res.status(200).json({
      success: true,
      data: await getCheckoutDeliveryOptions(),
    });
  } catch (error) {
    next(error);
  }
}

export async function getCheckoutQuoteController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = res.locals.auth;
  if (!auth) {
    res.status(401).json({ success: false, message: "Authentication is required." });
    return;
  }

  const parsed = checkoutQuoteQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    handleCheckoutError(parsed.error, res, next);
    return;
  }

  try {
    res.status(200).json({
      success: true,
      data: await getCheckoutQuote(auth.user.id, parsed.data),
    });
  } catch (error) {
    handleCheckoutError(error, res, next);
  }
}

export async function postCheckout(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const auth = res.locals.auth;
  if (!auth) {
    res.status(401).json({ success: false, message: "Authentication is required." });
    return;
  }

  const parsed = createCheckoutSchema.safeParse(req.body);
  if (!parsed.success) {
    handleCheckoutError(parsed.error, res, next);
    return;
  }

  try {
    const result = await createCheckout(
      auth.user.id,
      parsed.data,
    );
    res.status(result.reused ? 200 : 201).json({
      success: true,
      reused: result.reused,
      data: result.order,
    });
  } catch (error) {
    handleCheckoutError(error, res, next);
  }
}
