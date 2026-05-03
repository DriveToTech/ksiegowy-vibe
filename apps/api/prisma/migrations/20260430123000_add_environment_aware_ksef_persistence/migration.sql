BEGIN;

CREATE TABLE "CompanyKsefCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "environment" "KsefEnvironment" NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyKsefCredential_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "KsefSubmission"
    ADD COLUMN "environment" "KsefEnvironment" NOT NULL DEFAULT 'TEST';

ALTER TABLE "KsefSession"
    ADD COLUMN "environment" "KsefEnvironment" NOT NULL DEFAULT 'TEST';

ALTER TABLE "IncomingInvoice"
    ADD COLUMN "ksefEnvironment" "KsefEnvironment";

ALTER TABLE "KsefIncomingSync"
    ADD COLUMN "environment" "KsefEnvironment" NOT NULL DEFAULT 'TEST';

CREATE TABLE "InvoiceKsefState" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "environment" "KsefEnvironment" NOT NULL,
    "status" "InvoiceKsefStatus" NOT NULL DEFAULT 'NOT_SENT',
    "ksefReference" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "lastSubmissionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceKsefState_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "KsefSubmission"
    DROP CONSTRAINT IF EXISTS "KsefSubmission_invoiceId_attemptNumber_key";

DROP INDEX IF EXISTS "KsefSubmission_companyId_status_idx";

ALTER TABLE "KsefSession"
    DROP CONSTRAINT IF EXISTS "KsefSession_companyId_key";

CREATE UNIQUE INDEX "CompanyKsefCredential_companyId_environment_key" ON "CompanyKsefCredential"("companyId", "environment");
CREATE INDEX "CompanyKsefCredential_companyId_idx" ON "CompanyKsefCredential"("companyId");

CREATE UNIQUE INDEX "KsefSubmission_invoiceId_environment_attemptNumber_key" ON "KsefSubmission"("invoiceId", "environment", "attemptNumber");
CREATE INDEX "KsefSubmission_companyId_environment_status_idx" ON "KsefSubmission"("companyId", "environment", "status");

CREATE UNIQUE INDEX "KsefSession_companyId_environment_key" ON "KsefSession"("companyId", "environment");
CREATE INDEX "KsefSession_companyId_idx" ON "KsefSession"("companyId");

CREATE UNIQUE INDEX "InvoiceKsefState_invoiceId_environment_key" ON "InvoiceKsefState"("invoiceId", "environment");
CREATE INDEX "InvoiceKsefState_environment_status_idx" ON "InvoiceKsefState"("environment", "status");
CREATE INDEX "InvoiceKsefState_lastSubmissionId_idx" ON "InvoiceKsefState"("lastSubmissionId");

CREATE INDEX "IncomingInvoice_companyId_ksefEnvironment_ksefReference_idx" ON "IncomingInvoice"("companyId", "ksefEnvironment", "ksefReference");
CREATE INDEX "KsefIncomingSync_companyId_environment_idx" ON "KsefIncomingSync"("companyId", "environment");

ALTER TABLE "CompanyKsefCredential"
    ADD CONSTRAINT "CompanyKsefCredential_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceKsefState"
    ADD CONSTRAINT "InvoiceKsefState_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceKsefState"
    ADD CONSTRAINT "InvoiceKsefState_lastSubmissionId_fkey"
    FOREIGN KEY ("lastSubmissionId") REFERENCES "KsefSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
