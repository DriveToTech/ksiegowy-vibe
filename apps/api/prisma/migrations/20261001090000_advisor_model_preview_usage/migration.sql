-- CreateTable
CREATE TABLE "AdvisorModelPreviewUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AdvisorModelPreviewUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorModelPreviewUsage_userId_companyId_day_key" ON "AdvisorModelPreviewUsage"("userId", "companyId", "day");

-- CreateIndex
CREATE INDEX "AdvisorModelPreviewUsage_companyId_day_idx" ON "AdvisorModelPreviewUsage"("companyId", "day");

-- CreateIndex
CREATE INDEX "AdvisorModelPreviewUsage_day_idx" ON "AdvisorModelPreviewUsage"("day");
