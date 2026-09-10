-- The invoice lifecycle needs an explicit in-progress state while immutable
-- PDF/XML artifacts are generated outside the database transaction.
ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'ISSUING';

ALTER TABLE "KsefSubmission"
  ADD COLUMN IF NOT EXISTS "externalMutationStarted" BOOLEAN NOT NULL DEFAULT false;

