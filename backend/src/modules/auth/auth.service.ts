
import argon2 from "argon2";
import { createHash, randomBytes } from "node:crypto";

import { prisma } from "../../config/database.js";
import type {
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
} from "./auth.schemas.js";

export class AuthServiceError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isUniqueConstraintError(error: unknown): boolean {
  if (typeof error === "object" && error !== null && "code" in error) {
    return error.code === "P2002";
  }

  return false;
}

export async function registerCustomer(input: RegisterInput) {
  const passwordHash = await argon2.hash(input.password, {
    type: argon2.argon2id,
  });

  try {
    return await prisma.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        passwordHash,
        phone: input.phone || null,
        roles: {
          create: { role: "CUSTOMER" },
        },
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        status: true,
        createdAt: true,
        roles: {
          select: { role: true },
        },
      },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new AuthServiceError(
        "An account with this email may already exist.",
        409,
      );
    }

    throw error;
  }
}

export async function loginCustomer(
  input: LoginInput,
  metadata: {
    userAgent: string | null;
    ipAddress: string | null;
  },
) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      status: true,
      passwordHash: true,
      roles: {
        select: { role: true },
      },
    },
  });

  if (!user || user.status !== "ACTIVE") {
    throw new AuthServiceError("Invalid email or password.", 401);
  }

  const passwordIsValid = await argon2.verify(
    user.passwordHash,
    input.password,
  );

  if (!passwordIsValid) {
    throw new AuthServiceError("Invalid email or password.", 401);
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: metadata.userAgent,
      ipAddress: metadata.ipAddress,
    },
  });

  const { passwordHash: _passwordHash, ...publicUser } = user;

  return {
    user: publicUser,
    token,
    expiresAt,
  };
}

export async function updateUserProfile(
  userId: string,
  input: UpdateProfileInput,
) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      status: true,
      roles: {
        select: { role: true },
      },
    },
  });
}
