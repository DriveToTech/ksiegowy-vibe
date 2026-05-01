BEGIN;

CREATE TYPE "InvoiceCorrectionMode" AS ENUM ('CANCELLATION', 'FORMAL');

ALTER TABLE "Invoice"
    ADD COLUMN "correctionMode" "InvoiceCorrectionMode";

COMMIT;
