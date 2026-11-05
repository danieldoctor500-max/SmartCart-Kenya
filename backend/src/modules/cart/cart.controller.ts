import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  addCartItem,
  CartServiceError,
  clearCart,
  getCart,
  removeCartItem,
  updateCartItem,
} from "./cart.service.js";
import {
  addCartItemSchema,
  cartItemIdSchema,
  updateCartItemSchema,
} from "./cart.schemas.js";

const guestCookieName = "smartcart_guest";

function getIdentity(req: Request, res: Response) {
  const auth = res.locals.auth as
    | { user?: { id?: string } }
    | undefined;

  if (auth?.user?.id) {
    return {
      kind: "user" as const,
      userId: auth.user.id,
    };
  }

  const guestSessionId = req.cookies?.[guestCookieName];

  if (
    typeof guestSessionId === "string" &&
    /^[a-zA-Z0-9_-]{32,128}$/.test(guestSessionId)
  ) {
    return {
      kind: "guest" as const,
      guestSessionId,
    };
  }

  return null;
}

function ensureGuestCookie(res: Response): string {
  const guestSessionId = crypto.randomUUID().replace(/-/g, "");

  res.cookie(guestCookieName, guestSessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return guestSessionId;
}

function identityForRequest(req: Request, res: Response) {
  const existingIdentity = getIdentity(req, res);

  if (existingIdentity) {
    return existingIdentity;
  }

  return {
    kind: "guest" as const,
    guestSessionId: ensureGuestCookie(res),
  };
}

function sendValidationError(
  res: Response,
  error: z.ZodError,
) {
  return res.status(400).json({
    error: {
      code: "VALIDATION_ERROR",
      message: "Please check the submitted data.",
      details: error.flatten().fieldErrors,
    },
  });
}

function handleError(
  error: unknown,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof CartServiceError) {
    const statusByCode: Record<
      CartServiceError["code"],
      number
    > = {
      INVALID_IDENTITY: 400,
      PRODUCT_UNAVAILABLE: 404,
      INSUFFICIENT_STOCK: 409,
      CART_ITEM_NOT_FOUND: 404,
      INVALID_CART_STATE: 409,
    };

    return res.status(statusByCode[error.code]).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  return next(error);
}

export async function getCartController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const identity = identityForRequest(req, res);
    const cart = await getCart(identity);

    return res.status(200).json({ data: cart });
  } catch (error) {
    return handleError(error, res, next);
  }
}

export async function addCartItemController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const parsed = addCartItemSchema.safeParse(req.body);

  if (!parsed.success) {
    return sendValidationError(res, parsed.error);
  }

  try {
    const identity = identityForRequest(req, res);
    const cart = await addCartItem(
      identity,
      parsed.data.productId,
      parsed.data.quantity,
    );

    return res.status(200).json({ data: cart });
  } catch (error) {
    return handleError(error, res, next);
  }
}

export async function updateCartItemController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const parsedId = cartItemIdSchema.safeParse(
    req.params.itemId,
  );

  const parsedBody = updateCartItemSchema.safeParse(
    req.body,
  );

  if (!parsedId.success) {
    return sendValidationError(res, parsedId.error);
  }

  if (!parsedBody.success) {
    return sendValidationError(res, parsedBody.error);
  }

  try {
    const identity = identityForRequest(req, res);
    const cart = await updateCartItem(
      identity,
      parsedId.data,
      parsedBody.data.quantity,
    );

    return res.status(200).json({ data: cart });
  } catch (error) {
    return handleError(error, res, next);
  }
}

export async function removeCartItemController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const parsedId = cartItemIdSchema.safeParse(
    req.params.itemId,
  );

  if (!parsedId.success) {
    return sendValidationError(res, parsedId.error);
  }

  try {
    const identity = identityForRequest(req, res);
    const cart = await removeCartItem(
      identity,
      parsedId.data,
    );

    return res.status(200).json({ data: cart });
  } catch (error) {
    return handleError(error, res, next);
  }
}

export async function clearCartController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const identity = identityForRequest(req, res);
    const cart = await clearCart(identity);

    return res.status(200).json({ data: cart });
  } catch (error) {
    return handleError(error, res, next);
  }
}