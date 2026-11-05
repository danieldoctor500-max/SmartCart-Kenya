BEGIN;

CREATE TEMP TABLE "_user_cart_duplicates" ON COMMIT DROP AS
SELECT
  "id" AS "duplicateCartId",
  FIRST_VALUE("id") OVER (
    PARTITION BY "userId"
    ORDER BY "updatedAt" DESC, "createdAt" ASC, "id" ASC
  ) AS "canonicalCartId"
FROM "carts"
WHERE "userId" IS NOT NULL;

DELETE FROM "_user_cart_duplicates"
WHERE "duplicateCartId" = "canonicalCartId";

CREATE TEMP TABLE "_user_cart_item_totals" ON COMMIT DROP AS
SELECT
  duplicates."canonicalCartId",
  items."productId",
  SUM(items."quantity")::integer AS "quantity",
  MIN(items."id") AS "sourceItemId"
FROM "_user_cart_duplicates" AS duplicates
JOIN "cart_items" AS items
  ON items."cartId" = duplicates."duplicateCartId"
GROUP BY duplicates."canonicalCartId", items."productId";

UPDATE "cart_items" AS canonical_items
SET
  "quantity" = canonical_items."quantity" + totals."quantity",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_user_cart_item_totals" AS totals
WHERE canonical_items."cartId" = totals."canonicalCartId"
  AND canonical_items."productId" = totals."productId";

UPDATE "cart_items" AS source_items
SET
  "cartId" = totals."canonicalCartId",
  "quantity" = totals."quantity",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "_user_cart_item_totals" AS totals
WHERE source_items."id" = totals."sourceItemId"
  AND NOT EXISTS (
    SELECT 1
    FROM "cart_items" AS canonical_items
    WHERE canonical_items."cartId" = totals."canonicalCartId"
      AND canonical_items."productId" = totals."productId"
  );

DELETE FROM "carts" AS duplicate_carts
USING "_user_cart_duplicates" AS duplicates
WHERE duplicate_carts."id" = duplicates."duplicateCartId";

CREATE UNIQUE INDEX "carts_userId_key" ON "carts"("userId");

COMMIT;
