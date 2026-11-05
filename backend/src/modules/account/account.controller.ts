import type { NextFunction, Request, Response } from "express";
import {
  addressIdSchema,
  createAddressSchema,
  updateAddressSchema,
} from "./account.schemas.js";
import {
  AddressManagementError,
  createCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  makeCustomerAddressDefault,
  updateCustomerAddress,
} from "./account.service.js";

function sendValidationError(
  res: Response,
  issues: Array<{ path: PropertyKey[]; message: string }>,
) {
  res.status(400).json({
    success: false,
    code: "VALIDATION_ERROR",
    message: "Please check the submitted data.",
    errors: issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

function sendAddressError(
  error: unknown,
  res: Response,
  next: NextFunction,
) {
  if (error instanceof AddressManagementError) {
    res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  next(error);
}

export async function getAddresses(
  _req: Request,
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

  try {
    res.status(200).json({
      success: true,
      data: await listCustomerAddresses(auth.user.id),
    });
  } catch (error: unknown) {
    next(error);
  }
}

export async function postAddress(
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

  const parsed = createAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    res.status(201).json({
      success: true,
      data: await createCustomerAddress(auth.user.id, parsed.data),
    });
  } catch (error: unknown) {
    sendAddressError(error, res, next);
  }
}

export async function patchAddress(
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

  const parsedId = addressIdSchema.safeParse(req.params.addressId);
  if (!parsedId.success) {
    sendValidationError(res, parsedId.error.issues);
    return;
  }

  const parsed = updateAddressSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error.issues);
    return;
  }

  try {
    res.status(200).json({
      success: true,
      data: await updateCustomerAddress(
        auth.user.id,
        parsedId.data,
        parsed.data,
      ),
    });
  } catch (error: unknown) {
    sendAddressError(error, res, next);
  }
}

export async function makeAddressDefault(
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

  const parsedId = addressIdSchema.safeParse(req.params.addressId);
  if (!parsedId.success) {
    sendValidationError(res, parsedId.error.issues);
    return;
  }

  if (
    typeof req.body === "object" &&
    req.body !== null &&
    Object.keys(req.body).length > 0
  ) {
    sendValidationError(res, [
      {
        path: [Object.keys(req.body)[0]!],
        message: "The default-address endpoint does not accept a request body.",
      },
    ]);
    return;
  }

  try {
    res.status(200).json({
      success: true,
      data: await makeCustomerAddressDefault(
        auth.user.id,
        parsedId.data,
      ),
    });
  } catch (error: unknown) {
    sendAddressError(error, res, next);
  }
}

export async function removeAddress(
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

  const parsedId = addressIdSchema.safeParse(req.params.addressId);
  if (!parsedId.success) {
    sendValidationError(res, parsedId.error.issues);
    return;
  }

  try {
    await deleteCustomerAddress(auth.user.id, parsedId.data);
    res.status(200).json({
      success: true,
      message: "Address deleted successfully.",
    });
  } catch (error: unknown) {
    sendAddressError(error, res, next);
  }
}
