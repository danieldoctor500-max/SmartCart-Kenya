BEGIN;

-- Preflights use only existing columns and run before any DDL.
-- Historical records are never automatically changed or deleted.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "provider" = 'MPESA'::"PaymentProvider"
      AND "status" IN (
        'INITIATED'::"PaymentStatus",
        'PENDING'::"PaymentStatus",
        'INITIATION_UNKNOWN'::"PaymentStatus"
      )
    GROUP BY "orderId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate active M-Pesa attempts exist; investigate before Migration B';
  END IF;
END
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payments"
    WHERE "provider" = 'MPESA'::"PaymentProvider"
      AND ("currency" <> 'KES' OR "amount" <> trunc("amount"))
  ) THEN
    RAISE EXCEPTION
      'Historical M-Pesa payments violate the whole-KES constraint';
  END IF;
END
$$;

ALTER TABLE "payments"
  ADD COLUMN "initiationIdempotencyKey" TEXT,
  ADD COLUMN "dispatchStartedAt" TIMESTAMP(3),
  ADD COLUMN "providerResponseAt" TIMESTAMP(3),
  ADD COLUMN "providerResultCode" TEXT;

CREATE UNIQUE INDEX "payments_initiationIdempotencyKey_key"
  ON "payments" ("initiationIdempotencyKey");

CREATE UNIQUE INDEX "payments_one_active_mpesa_attempt_per_order_idx"
  ON "payments" ("orderId")
  WHERE "provider" = 'MPESA'::"PaymentProvider"
    AND "status" IN (
      'INITIATED'::"PaymentStatus",
      'PENDING'::"PaymentStatus",
      'INITIATION_UNKNOWN'::"PaymentStatus"
    );

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_mpesa_kes_whole_shilling_check"
  CHECK (
    "provider" <> 'MPESA'::"PaymentProvider"
    OR ("currency" = 'KES' AND "amount" = trunc("amount"))
  );

CREATE TABLE "daraja_callback_inbox" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT,
  "callbackIdentity" CHAR(64) NOT NULL,
  "callbackFingerprint" CHAR(64) NOT NULL,
  "fingerprintKeyVersion" INTEGER NOT NULL,
  "checkoutRequestId" TEXT,
  "merchantRequestId" TEXT,
  "resultCode" TEXT,
  "providerTransactionId" TEXT,
  "status" "DarajaCallbackInboxStatus" NOT NULL DEFAULT 'RECEIVED',
  "sanitizedPayload" JSONB NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),

  CONSTRAINT "daraja_callback_inbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daraja_callback_inbox_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "daraja_callback_inbox_fingerprint_version_check"
    CHECK ("fingerprintKeyVersion" > 0),
  CONSTRAINT "daraja_callback_inbox_identity_hex_check"
    CHECK (btrim("callbackIdentity") ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "daraja_callback_inbox_fingerprint_hex_check"
    CHECK (btrim("callbackFingerprint") ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "daraja_callback_inbox_result_code_check"
    CHECK ("resultCode" IS NULL OR "resultCode" ~ '^[0-9]+$'),
  CONSTRAINT "daraja_callback_inbox_request_ids_nonempty_check"
    CHECK (
      ("checkoutRequestId" IS NULL OR length(btrim("checkoutRequestId")) > 0)
      AND ("merchantRequestId" IS NULL OR length(btrim("merchantRequestId")) > 0)
      AND ("providerTransactionId" IS NULL OR length(btrim("providerTransactionId")) > 0)
    )
);

CREATE UNIQUE INDEX "daraja_callback_inbox_callbackIdentity_key"
  ON "daraja_callback_inbox" ("callbackIdentity");
CREATE INDEX "daraja_callback_inbox_checkoutRequestId_idx"
  ON "daraja_callback_inbox" ("checkoutRequestId");
CREATE INDEX "daraja_callback_inbox_merchantRequestId_idx"
  ON "daraja_callback_inbox" ("merchantRequestId");
CREATE INDEX "daraja_callback_inbox_paymentId_receivedAt_idx"
  ON "daraja_callback_inbox" ("paymentId", "receivedAt");
CREATE INDEX "daraja_callback_inbox_status_receivedAt_idx"
  ON "daraja_callback_inbox" ("status", "receivedAt");

CREATE TABLE "daraja_callback_correlations" (
  "id" TEXT NOT NULL,
  "callbackInboxId" TEXT NOT NULL,
  "identifierType" TEXT NOT NULL,
  "identifierIdentity" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "daraja_callback_correlations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "daraja_callback_correlations_inbox_fkey"
    FOREIGN KEY ("callbackInboxId") REFERENCES "daraja_callback_inbox"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "daraja_callback_correlations_type_check"
    CHECK ("identifierType" IN ('CHECKOUT_REQUEST', 'MERCHANT_REQUEST')),
  CONSTRAINT "daraja_callback_correlations_identity_hex_check"
    CHECK (btrim("identifierIdentity") ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "daraja_callback_correlations_inbox_type_key"
  ON "daraja_callback_correlations" ("callbackInboxId", "identifierType");
CREATE INDEX "daraja_callback_correlations_type_identity_idx"
  ON "daraja_callback_correlations" ("identifierType", "identifierIdentity");

CREATE TABLE "payment_review_cases" (
  "id" TEXT NOT NULL,
  "openingKey" CHAR(64) NOT NULL,
  "orderId" TEXT NOT NULL,
  "paymentId" TEXT,
  "reason" "PaymentReviewReason" NOT NULL,
  "status" "PaymentReviewStatus" NOT NULL DEFAULT 'OPEN',
  "summary" TEXT NOT NULL,
  "openedById" TEXT,
  "resolvedById" TEXT,
  "resolution" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_review_cases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_review_cases_openingKey_hex_check"
    CHECK (btrim("openingKey") ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "payment_review_cases_order_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_review_cases_payment_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_review_cases_opened_by_fkey"
    FOREIGN KEY ("openedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "payment_review_cases_resolved_by_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "payment_review_cases_openingKey_key"
  ON "payment_review_cases" ("openingKey");
CREATE INDEX "payment_review_cases_status_openedAt_idx"
  ON "payment_review_cases" ("status", "openedAt");
CREATE INDEX "payment_review_cases_orderId_openedAt_idx"
  ON "payment_review_cases" ("orderId", "openedAt");
CREATE INDEX "payment_review_cases_paymentId_openedAt_idx"
  ON "payment_review_cases" ("paymentId", "openedAt");

CREATE TABLE "payment_review_events" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "actorType" "PaymentActionActorType" NOT NULL,
  "actorId" TEXT,
  "callbackInboxId" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "payment_review_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_review_events_case_fkey"
    FOREIGN KEY ("caseId") REFERENCES "payment_review_cases"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_review_events_actor_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_review_events_callback_fkey"
    FOREIGN KEY ("callbackInboxId") REFERENCES "daraja_callback_inbox"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payment_review_events_actor_type_check"
    CHECK (
      ("actorType" = 'SYSTEM'::"PaymentActionActorType" AND "actorId" IS NULL)
      OR
      ("actorType" = 'ADMIN'::"PaymentActionActorType" AND "actorId" IS NOT NULL)
    )
);

CREATE INDEX "payment_review_events_caseId_createdAt_idx"
  ON "payment_review_events" ("caseId", "createdAt");
CREATE INDEX "payment_review_events_actorId_createdAt_idx"
  ON "payment_review_events" ("actorId", "createdAt");
CREATE INDEX "payment_review_events_callbackInboxId_idx"
  ON "payment_review_events" ("callbackInboxId");

CREATE TABLE "merchant_refunds" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "reviewCaseId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "actorType" "PaymentActionActorType" NOT NULL,
  "actorId" TEXT,
  "status" "MerchantRefundStatus" NOT NULL DEFAULT 'INITIATED',
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'KES',
  "reason" TEXT NOT NULL,
  "providerRefundId" TEXT,
  "providerRequestId" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "dispatchStartedAt" TIMESTAMP(3),
  "providerResponseAt" TIMESTAMP(3),
  "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "merchant_refunds_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_refunds_payment_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "merchant_refunds_review_case_fkey"
    FOREIGN KEY ("reviewCaseId") REFERENCES "payment_review_cases"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "merchant_refunds_actor_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "merchant_refunds_actor_type_check"
    CHECK (
      ("actorType" = 'SYSTEM'::"PaymentActionActorType" AND "actorId" IS NULL)
      OR
      ("actorType" = 'ADMIN'::"PaymentActionActorType" AND "actorId" IS NOT NULL)
    ),
  CONSTRAINT "merchant_refunds_amount_check"
    CHECK (
      "amount" > 0
      AND "currency" = 'KES'
      AND "amount" = trunc("amount")
    )
);

CREATE UNIQUE INDEX "merchant_refunds_idempotencyKey_key"
  ON "merchant_refunds" ("idempotencyKey");
CREATE UNIQUE INDEX "merchant_refunds_providerRefundId_key"
  ON "merchant_refunds" ("providerRefundId");
CREATE INDEX "merchant_refunds_paymentId_status_createdAt_idx"
  ON "merchant_refunds" ("paymentId", "status", "createdAt");
CREATE INDEX "merchant_refunds_reviewCaseId_idx"
  ON "merchant_refunds" ("reviewCaseId");
CREATE INDEX "merchant_refunds_status_createdAt_idx"
  ON "merchant_refunds" ("status", "createdAt");
CREATE INDEX "merchant_refunds_providerRequestId_idx"
  ON "merchant_refunds" ("providerRequestId");

CREATE TABLE "merchant_refund_events" (
  "id" TEXT NOT NULL,
  "refundId" TEXT NOT NULL,
  "actorType" "PaymentActionActorType" NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "merchant_refund_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "merchant_refund_events_refund_fkey"
    FOREIGN KEY ("refundId") REFERENCES "merchant_refunds"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "merchant_refund_events_actor_fkey"
    FOREIGN KEY ("actorId") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "merchant_refund_events_actor_type_check"
    CHECK (
      ("actorType" = 'SYSTEM'::"PaymentActionActorType" AND "actorId" IS NULL)
      OR
      ("actorType" = 'ADMIN'::"PaymentActionActorType" AND "actorId" IS NOT NULL)
    )
);

CREATE INDEX "merchant_refund_events_refundId_createdAt_idx"
  ON "merchant_refund_events" ("refundId", "createdAt");
CREATE INDEX "merchant_refund_events_actorId_createdAt_idx"
  ON "merchant_refund_events" ("actorId", "createdAt");

COMMIT;
