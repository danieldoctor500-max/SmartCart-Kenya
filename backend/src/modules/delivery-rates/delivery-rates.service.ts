import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/database.js";
import type {
  ListDeliveryRateAuditInput,
  ListDeliveryRatesInput,
} from "./delivery-rates.schemas.js";

export class DeliveryRateError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "DeliveryRateError";
  }
}

export function normalizeLocationKey(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export async function findActiveDeliveryRate(
  county: string,
  town: string,
  client: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const rate = await client.deliveryRate.findUnique({
    where: {
      countyKey_townKey: {
        countyKey: normalizeLocationKey(county),
        townKey: normalizeLocationKey(town),
      },
    },
  });

  if (!rate || !rate.isActive) {
    throw new DeliveryRateError(
      "Delivery is not configured for this county and town.",
      422,
    );
  }

  return rate;
}

export async function listActiveDeliveryOptions() {
  const rates = await prisma.deliveryRate.findMany({
    where: { isActive: true },
    select: {
      county: true,
      town: true,
      fee: true,
    },
    orderBy: [{ countyKey: "asc" }, { townKey: "asc" }],
  });

  return rates.map((rate) => ({
    county: rate.county,
    town: rate.town,
    fee: Number(rate.fee),
    currency: "KES",
  }));
}

export async function listDeliveryRates(input: ListDeliveryRatesInput) {
  const where: Prisma.DeliveryRateWhereInput = {
    ...(input.status
      ? { isActive: input.status === "ACTIVE" }
      : {}),
    ...(input.search
      ? {
          OR: [
            {
              county: {
                contains: input.search,
                mode: "insensitive",
              },
            },
            {
              town: {
                contains: input.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };
  const skip = (input.page - 1) * input.limit;

  const [rates, total] = await prisma.$transaction([
    prisma.deliveryRate.findMany({
      where,
      orderBy: [
        { countyKey: "asc" },
        { townKey: "asc" },
        { id: "asc" },
      ],
      skip,
      take: input.limit,
    }),
    prisma.deliveryRate.count({ where }),
  ]);

  return {
    items: rates.map((rate) => ({
      ...rate,
      fee: Number(rate.fee),
      currency: "KES" as const,
    })),
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function listDeliveryRateAudit(
  rateId: string,
  input: ListDeliveryRateAuditInput,
) {
  const rate = await prisma.deliveryRate.findUnique({
    where: { id: rateId },
    select: { id: true },
  });
  if (!rate) {
    throw new DeliveryRateError("Delivery rate not found.", 404);
  }

  const where = {
    resourceType: "DELIVERY_RATE",
    resourceId: rateId,
  };
  const skip = (input.page - 1) * input.limit;
  const [entries, total] = await prisma.$transaction([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: input.limit,
      select: {
        id: true,
        action: true,
        outcome: true,
        metadata: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: entries,
    pagination: {
      page: input.page,
      limit: input.limit,
      total,
      totalPages: Math.ceil(total / input.limit),
    },
  };
}

export async function saveDeliveryRate(
  input: {
    county: string;
    town: string;
    fee: number;
    isActive: boolean;
  },
  adminUserId: string,
) {
  const county = input.county.trim().replace(/\s+/g, " ");
  const town = input.town.trim().replace(/\s+/g, " ");
  const countyKey = normalizeLocationKey(county);
  const townKey = normalizeLocationKey(town);

  try {
    const rate = await prisma.$transaction(async (tx) => {
      const before = await tx.deliveryRate.findUnique({
        where: {
          countyKey_townKey: { countyKey, townKey },
        },
      });
      const saved = await tx.deliveryRate.upsert({
        where: {
          countyKey_townKey: { countyKey, townKey },
        },
        create: {
          county,
          countyKey,
          town,
          townKey,
          fee: input.fee,
          isActive: input.isActive,
        },
        update: {
          county,
          town,
          fee: input.fee,
          isActive: input.isActive,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "DELIVERY_RATE_UPSERTED",
          resourceType: "DELIVERY_RATE",
          resourceId: saved.id,
          outcome: "SUCCESS",
          metadata: {
            before: before
              ? {
                  county: before.county,
                  town: before.town,
                  fee: Number(before.fee),
                  isActive: before.isActive,
                }
              : null,
            after: {
              county: saved.county,
              town: saved.town,
              fee: Number(saved.fee),
              isActive: saved.isActive,
            },
          },
        },
      });

      return saved;
    });

    return {
      ...rate,
      fee: Number(rate.fee),
      currency: "KES",
    };
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DeliveryRateError(
        "A rate already exists for this county and town.",
        409,
      );
    }

    throw error;
  }
}

export async function updateDeliveryRate(
  id: string,
  input: {
    county?: string;
    town?: string;
    fee?: number;
    isActive?: boolean;
  },
  adminUserId: string,
) {
  try {
    const rate = await prisma.$transaction(async (tx) => {
      const existing = await tx.deliveryRate.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new DeliveryRateError("Delivery rate not found.", 404);
      }

      const county = (input.county ?? existing.county)
        .trim()
        .replace(/\s+/g, " ");
      const town = (input.town ?? existing.town)
        .trim()
        .replace(/\s+/g, " ");
      const updated = await tx.deliveryRate.update({
        where: { id },
        data: {
          county,
          countyKey: normalizeLocationKey(county),
          town,
          townKey: normalizeLocationKey(town),
          ...(input.fee !== undefined && { fee: input.fee }),
          ...(input.isActive !== undefined && { isActive: input.isActive }),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action:
            input.isActive === false
              ? "DELIVERY_RATE_DEACTIVATED"
              : "DELIVERY_RATE_UPDATED",
          resourceType: "DELIVERY_RATE",
          resourceId: id,
          outcome: "SUCCESS",
          metadata: {
            before: {
              county: existing.county,
              town: existing.town,
              fee: Number(existing.fee),
              isActive: existing.isActive,
            },
            after: {
              county: updated.county,
              town: updated.town,
              fee: Number(updated.fee),
              isActive: updated.isActive,
            },
          },
        },
      });

      return updated;
    });

    return {
      ...rate,
      fee: Number(rate.fee),
      currency: "KES",
    };
  } catch (error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new DeliveryRateError(
        "A rate already exists for this county and town.",
        409,
      );
    }

    throw error;
  }
}
