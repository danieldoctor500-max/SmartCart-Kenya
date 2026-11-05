BEGIN;

ALTER TYPE "InventoryMovementReason"
  ADD VALUE 'RESERVATION';

CREATE TABLE "delivery_rates" (
  "id" TEXT NOT NULL,
  "county" TEXT NOT NULL,
  "countyKey" TEXT NOT NULL,
  "town" TEXT NOT NULL,
  "townKey" TEXT NOT NULL,
  "fee" DECIMAL(12,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "delivery_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "delivery_rates_countyKey_townKey_key"
  ON "delivery_rates"("countyKey", "townKey");
CREATE INDEX "delivery_rates_isActive_countyKey_idx"
  ON "delivery_rates"("isActive", "countyKey");

ALTER TABLE "orders"
  ADD COLUMN "deliveryRecipientName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "deliveryPhone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "deliveryCounty" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "deliveryTown" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "deliveryAddressLine" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "deliveryInstructions" TEXT;

UPDATE "orders" AS order_record
SET
  "deliveryRecipientName" = address_record."recipientName",
  "deliveryPhone" = address_record."phone",
  "deliveryCounty" = address_record."county",
  "deliveryTown" = address_record."town",
  "deliveryAddressLine" = address_record."addressLine",
  "deliveryInstructions" = address_record."deliveryInstructions"
FROM "addresses" AS address_record
WHERE address_record."id" = order_record."addressId";

ALTER TABLE "orders"
  ALTER COLUMN "deliveryRecipientName" DROP DEFAULT,
  ALTER COLUMN "deliveryPhone" DROP DEFAULT,
  ALTER COLUMN "deliveryCounty" DROP DEFAULT,
  ALTER COLUMN "deliveryTown" DROP DEFAULT,
  ALTER COLUMN "deliveryAddressLine" DROP DEFAULT;

COMMIT;
