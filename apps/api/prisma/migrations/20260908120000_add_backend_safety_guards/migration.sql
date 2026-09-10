BEGIN;

-- Keep correction requests and stored files idempotent across retries.
ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "correctionRequestHash" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Invoice_correctionRequestHash_key"
  ON "Invoice"("correctionRequestHash");

ALTER TABLE "FileRecord"
  ADD COLUMN IF NOT EXISTS "storageIdempotencyKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "FileRecord_storageIdempotencyKey_key"
  ON "FileRecord"("storageIdempotencyKey");

-- Empty references must behave like missing references before enforcing
-- environment-scoped KSeF reference uniqueness.
UPDATE "IncomingInvoice"
SET "ksefReference" = NULL
WHERE "ksefReference" IS NOT NULL
  AND btrim("ksefReference") = '';

CREATE UNIQUE INDEX IF NOT EXISTS "IncomingInvoice_companyId_environment_ksefReference_key"
  ON "IncomingInvoice"("companyId", "environment", "ksefReference");

COMMIT;
