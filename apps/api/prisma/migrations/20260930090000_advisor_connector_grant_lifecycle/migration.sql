-- AlterTable
ALTER TABLE "AdvisorConnectorGrant" ADD COLUMN "lastUsedAt" TIMESTAMP(3),
ADD COLUMN "revokedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "AdvisorConnectorGrant_revokedAt_idx" ON "AdvisorConnectorGrant"("revokedAt");
