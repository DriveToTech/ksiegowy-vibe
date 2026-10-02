CREATE TABLE "AdvisorInsightDismissal" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "environment" "KsefEnvironment" NOT NULL,
    "insightKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvisorInsightDismissal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdvisorInsightDismissal_membershipId_environment_insightKey_version_key"
    ON "AdvisorInsightDismissal"("membershipId", "environment", "insightKey", "version");

ALTER TABLE "AdvisorInsightDismissal" ADD CONSTRAINT "AdvisorInsightDismissal_membershipId_fkey"
    FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;