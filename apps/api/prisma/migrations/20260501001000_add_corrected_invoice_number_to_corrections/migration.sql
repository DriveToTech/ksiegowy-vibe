BEGIN;

ALTER TABLE "Invoice"
    ADD COLUMN "correctedInvoiceNumber" TEXT;

COMMIT;
