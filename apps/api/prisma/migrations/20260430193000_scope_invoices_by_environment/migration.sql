BEGIN;

ALTER TABLE "Invoice"
    ADD COLUMN "environment" "KsefEnvironment" NOT NULL DEFAULT 'TEST';

DROP INDEX IF EXISTS "Invoice_companyId_invoiceNumber_key";

CREATE UNIQUE INDEX "Invoice_companyId_environment_invoiceNumber_key"
    ON "Invoice"("companyId", "environment", "invoiceNumber");

CREATE INDEX "Invoice_companyId_environment_issueDate_idx"
    ON "Invoice"("companyId", "environment", "issueDate");

CREATE INDEX "Invoice_companyId_environment_status_idx"
    ON "Invoice"("companyId", "environment", "status");

COMMIT;
