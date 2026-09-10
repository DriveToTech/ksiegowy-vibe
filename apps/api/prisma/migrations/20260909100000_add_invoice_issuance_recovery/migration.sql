ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "issuingStartedAt" TIMESTAMP(3);

-- Existing in-progress rows need a recovery timestamp. updatedAt is the only
-- trustworthy timestamp available for rows created before this field existed.
UPDATE "Invoice"
SET "issuingStartedAt" = "updatedAt"
WHERE "status" = 'ISSUING'
  AND "issuingStartedAt" IS NULL;
