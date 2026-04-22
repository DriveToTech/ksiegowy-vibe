-- Keep document lifecycle in Invoice.status and KSeF lifecycle in Invoice.ksefStatus.
-- Legacy KSeF-specific Invoice.status values are normalized back to ISSUED.

BEGIN;

ALTER TABLE "Invoice"
ALTER COLUMN "status" DROP DEFAULT;

CREATE TYPE "InvoiceStatus_new" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

ALTER TABLE "Invoice"
ALTER COLUMN "status" TYPE "InvoiceStatus_new"
USING (
  CASE
    WHEN "status" IN ('SENT_TO_KSEF', 'KSEF_ACCEPTED', 'KSEF_REJECTED') THEN 'ISSUED'::text
    ELSE "status"::text
  END
)::"InvoiceStatus_new";

ALTER TYPE "InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "InvoiceStatus_old";

ALTER TABLE "Invoice"
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

COMMIT;
