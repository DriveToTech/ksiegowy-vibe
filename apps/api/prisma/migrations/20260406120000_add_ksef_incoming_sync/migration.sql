-- AlterEnum: add KSEF_SYNCED value (IF NOT EXISTS makes this safe to re-run)
ALTER TYPE "IncomingInvoiceStatus" ADD VALUE IF NOT EXISTS 'KSEF_SYNCED';

-- AlterTable
ALTER TABLE "IncomingInvoice"
  ADD COLUMN IF NOT EXISTS "ksefFetchedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'upload';

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IncomingInvoice_companyId_ksefReference_idx" ON "IncomingInvoice"("companyId", "ksefReference");

-- CreateTable
CREATE TABLE IF NOT EXISTS "KsefIncomingSync" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "linkedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KsefIncomingSync_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KsefIncomingSync_companyId_idx" ON "KsefIncomingSync"("companyId");

-- AddForeignKey (skip if already exists)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'KsefIncomingSync_companyId_fkey'
  ) THEN
    ALTER TABLE "KsefIncomingSync" ADD CONSTRAINT "KsefIncomingSync_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
