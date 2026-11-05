BEGIN;

WITH ranked_defaults AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId"
      ORDER BY "updatedAt" DESC, "createdAt" DESC, "id" ASC
    ) AS position
  FROM "addresses"
  WHERE "isDefault" = true
)
UPDATE "addresses" AS address
SET "isDefault" = false
FROM ranked_defaults
WHERE address."id" = ranked_defaults."id"
  AND ranked_defaults.position > 1;

CREATE UNIQUE INDEX "addresses_one_default_per_user_idx"
  ON "addresses" ("userId")
  WHERE "isDefault" = true;

COMMIT;
