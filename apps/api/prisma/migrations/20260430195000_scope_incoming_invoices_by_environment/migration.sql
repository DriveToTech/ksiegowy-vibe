BEGIN;

ALTER TABLE "IncomingInvoice"
    ADD COLUMN "environment" "KsefEnvironment" NOT NULL DEFAULT 'TEST';

CREATE INDEX "IncomingInvoice_companyId_environment_status_idx"
    ON "IncomingInvoice"("companyId", "environment", "status");

CREATE INDEX "IncomingInvoice_companyId_environment_createdAt_idx"
    ON "IncomingInvoice"("companyId", "environment", "createdAt");

COMMIT;
