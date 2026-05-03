BEGIN;

-- Existing KSeF data was historically single-environment and implicitly scoped by Company.ksefEnv.
-- Backfill all new environment-aware structures from that company-level source of truth.

UPDATE "KsefSession" AS "ksefSession"
SET "environment" = "company"."ksefEnv"
FROM "Company" AS "company"
WHERE "company"."id" = "ksefSession"."companyId"
  AND "ksefSession"."environment" <> "company"."ksefEnv";

UPDATE "KsefSubmission" AS "ksefSubmission"
SET "environment" = "company"."ksefEnv"
FROM "Invoice" AS "invoice"
JOIN "Company" AS "company" ON "company"."id" = "invoice"."companyId"
WHERE "invoice"."id" = "ksefSubmission"."invoiceId"
  AND "ksefSubmission"."environment" <> "company"."ksefEnv";

UPDATE "KsefIncomingSync" AS "ksefIncomingSync"
SET "environment" = "company"."ksefEnv"
FROM "Company" AS "company"
WHERE "company"."id" = "ksefIncomingSync"."companyId"
  AND "ksefIncomingSync"."environment" <> "company"."ksefEnv";

UPDATE "IncomingInvoice" AS "incomingInvoice"
SET "ksefEnvironment" = "company"."ksefEnv"
FROM "Company" AS "company"
WHERE "company"."id" = "incomingInvoice"."companyId"
  AND "incomingInvoice"."ksefEnvironment" IS NULL
  AND (
    "incomingInvoice"."source" = 'ksef'
    OR "incomingInvoice"."ksefReference" IS NOT NULL
    OR "incomingInvoice"."ksefFetchedAt" IS NOT NULL
  );

INSERT INTO "CompanyKsefCredential" (
  "id",
  "companyId",
  "environment",
  "tokenEnc",
  "tokenIv",
  "createdAt",
  "updatedAt"
)
SELECT
  'ckc_' || md5("company"."id" || ':' || "company"."ksefEnv"::text),
  "company"."id",
  "company"."ksefEnv",
  "company"."ksefTokenEnc",
  "company"."ksefTokenIv",
  "company"."createdAt",
  "company"."updatedAt"
FROM "Company" AS "company"
WHERE "company"."ksefTokenEnc" IS NOT NULL
  AND "company"."ksefTokenIv" IS NOT NULL
ON CONFLICT ("companyId", "environment") DO NOTHING;

WITH "latestSubmission" AS (
  SELECT DISTINCT ON ("ksefSubmission"."invoiceId")
    "ksefSubmission"."invoiceId",
    "ksefSubmission"."id",
    "ksefSubmission"."environment"
  FROM "KsefSubmission" AS "ksefSubmission"
  ORDER BY "ksefSubmission"."invoiceId", "ksefSubmission"."attemptNumber" DESC, "ksefSubmission"."createdAt" DESC
)
INSERT INTO "InvoiceKsefState" (
  "id",
  "invoiceId",
  "environment",
  "status",
  "ksefReference",
  "submittedAt",
  "acceptedAt",
  "lastSubmissionId",
  "createdAt",
  "updatedAt"
)
SELECT
  'iks_' || md5("invoice"."id" || ':' || "company"."ksefEnv"::text),
  "invoice"."id",
  "company"."ksefEnv",
  "invoice"."ksefStatus",
  "invoice"."ksefReference",
  "invoice"."ksefSubmittedAt",
  "invoice"."ksefAcceptedAt",
  "latestSubmission"."id",
  "invoice"."createdAt",
  "invoice"."updatedAt"
FROM "Invoice" AS "invoice"
JOIN "Company" AS "company" ON "company"."id" = "invoice"."companyId"
LEFT JOIN "latestSubmission"
  ON "latestSubmission"."invoiceId" = "invoice"."id"
 AND "latestSubmission"."environment" = "company"."ksefEnv"
ON CONFLICT ("invoiceId", "environment") DO NOTHING;

COMMIT;
