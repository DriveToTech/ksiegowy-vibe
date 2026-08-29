-- CreateEnum
CREATE TYPE "GoalKind" AS ENUM ('ONE_OFF', 'ONGOING', 'NO_CEILING');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GoalMovementSource" AS ENUM ('MANUAL', 'AUTOMATION', 'ROUND_UP');

-- CreateEnum
CREATE TYPE "GoalAutomationRuleType" AS ENUM ('FIXED_ON_DAY', 'PERCENT_OF_INCOME_OVER_THRESHOLD', 'ROUND_UP');

-- AlterTable
ALTER TABLE "HouseholdTransaction" ADD COLUMN "goalMovementId" TEXT;

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "GoalKind" NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "targetAmount" DECIMAL(15,2),
    "currentAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "targetDate" DATE,
    "monthlyAmount" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Goal_currentAmount_nonnegative_check" CHECK ("currentAmount" >= 0),
    CONSTRAINT "Goal_targetAmount_shape_check" CHECK (
      ("kind" = 'ONE_OFF' AND "targetAmount" > 0
        AND (("targetDate" IS NOT NULL AND "monthlyAmount" IS NULL)
          OR ("targetDate" IS NULL AND "monthlyAmount" > 0)))
      OR ("kind" = 'ONGOING' AND "targetAmount" > 0 AND "targetDate" IS NULL AND "monthlyAmount" > 0)
      OR ("kind" = 'NO_CEILING' AND "targetAmount" IS NULL AND "targetDate" IS NULL AND "monthlyAmount" > 0)
    ),
    CONSTRAINT "Goal_currentAmount_target_check" CHECK ("targetAmount" IS NULL OR "currentAmount" <= "targetAmount")
);

-- CreateTable
CREATE TABLE "GoalMovement" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "source" "GoalMovementSource" NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "automationRuleId" TEXT,
    "sourceTransactionId" TEXT,
    "transferGroupId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "calculationWindowStart" DATE,
    "calculationWindowEnd" DATE,
    "balanceAfter" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalMovement_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GoalMovement_amount_nonzero_check" CHECK ("amount" <> 0),
    CONSTRAINT "GoalMovement_balanceAfter_nonnegative_check" CHECK ("balanceAfter" >= 0)
);

-- CreateTable
CREATE TABLE "GoalAutomationRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "ruleType" "GoalAutomationRuleType" NOT NULL,
    "fundingAccountId" TEXT NOT NULL,
    "triggerAccountId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "fixedAmount" DECIMAL(15,2),
    "dayOfMonth" INTEGER,
    "percentage" DECIMAL(5,2),
    "incomeThreshold" DECIMAL(15,2),
    "roundUpToAmount" DECIMAL(15,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoalAutomationRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GoalAutomationRule_config_check" CHECK (
      ("ruleType" = 'FIXED_ON_DAY' AND "fixedAmount" > 0 AND "dayOfMonth" BETWEEN 1 AND 28
        AND "triggerAccountId" IS NULL AND "percentage" IS NULL AND "incomeThreshold" IS NULL AND "roundUpToAmount" IS NULL)
      OR ("ruleType" = 'PERCENT_OF_INCOME_OVER_THRESHOLD' AND "triggerAccountId" IS NOT NULL
        AND "percentage" > 0 AND "percentage" <= 100 AND "incomeThreshold" >= 0
        AND "fixedAmount" IS NULL AND "dayOfMonth" IS NULL AND "roundUpToAmount" IS NULL)
      OR ("ruleType" = 'ROUND_UP' AND "triggerAccountId" IS NOT NULL AND "roundUpToAmount" > 0
        AND "fixedAmount" IS NULL AND "dayOfMonth" IS NULL AND "percentage" IS NULL AND "incomeThreshold" IS NULL)
    )
);

-- CreateIndex
CREATE INDEX "HouseholdTransaction_goalMovementId_idx" ON "HouseholdTransaction"("goalMovementId");

CREATE INDEX "Goal_householdId_idx" ON "Goal"("householdId");
CREATE INDEX "Goal_householdId_accountId_idx" ON "Goal"("householdId", "accountId");
CREATE INDEX "Goal_accountId_idx" ON "Goal"("accountId");
CREATE INDEX "Goal_householdId_status_idx" ON "Goal"("householdId", "status");

CREATE UNIQUE INDEX "GoalMovement_transferGroupId_key" ON "GoalMovement"("transferGroupId");
CREATE UNIQUE INDEX "GoalMovement_idempotencyKey_key" ON "GoalMovement"("idempotencyKey");
CREATE INDEX "GoalMovement_goalId_effectiveDate_idx" ON "GoalMovement"("goalId", "effectiveDate");
CREATE INDEX "GoalMovement_householdId_effectiveDate_idx" ON "GoalMovement"("householdId", "effectiveDate");
CREATE INDEX "GoalMovement_automationRuleId_sourceTransactionId_idx" ON "GoalMovement"("automationRuleId", "sourceTransactionId");
CREATE INDEX "GoalMovement_sourceTransactionId_idx" ON "GoalMovement"("sourceTransactionId");

CREATE INDEX "GoalAutomationRule_householdId_idx" ON "GoalAutomationRule"("householdId");
CREATE INDEX "GoalAutomationRule_goalId_isActive_idx" ON "GoalAutomationRule"("goalId", "isActive");
CREATE INDEX "GoalAutomationRule_fundingAccountId_idx" ON "GoalAutomationRule"("fundingAccountId");
CREATE INDEX "GoalAutomationRule_triggerAccountId_idx" ON "GoalAutomationRule"("triggerAccountId");

CREATE UNIQUE INDEX "GoalAutomationRule_fixed_active_key"
  ON "GoalAutomationRule"("goalId", "fundingAccountId", "dayOfMonth")
  WHERE "isActive" = true AND "ruleType" = 'FIXED_ON_DAY';
CREATE UNIQUE INDEX "GoalAutomationRule_percent_active_key"
  ON "GoalAutomationRule"("goalId", "triggerAccountId")
  WHERE "isActive" = true AND "ruleType" = 'PERCENT_OF_INCOME_OVER_THRESHOLD';
CREATE UNIQUE INDEX "GoalAutomationRule_round_up_active_key"
  ON "GoalAutomationRule"("householdId")
  WHERE "isActive" = true AND "ruleType" = 'ROUND_UP';

-- AddForeignKey
ALTER TABLE "HouseholdTransaction" ADD CONSTRAINT "HouseholdTransaction_goalMovementId_fkey"
  FOREIGN KEY ("goalMovementId") REFERENCES "GoalMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "HouseholdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoalMovement" ADD CONSTRAINT "GoalMovement_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalMovement" ADD CONSTRAINT "GoalMovement_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalAutomationRule" ADD CONSTRAINT "GoalAutomationRule_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalAutomationRule" ADD CONSTRAINT "GoalAutomationRule_goalId_fkey"
  FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoalAutomationRule" ADD CONSTRAINT "GoalAutomationRule_fundingAccountId_fkey"
  FOREIGN KEY ("fundingAccountId") REFERENCES "HouseholdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoalAutomationRule" ADD CONSTRAINT "GoalAutomationRule_triggerAccountId_fkey"
  FOREIGN KEY ("triggerAccountId") REFERENCES "HouseholdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoalMovement" ADD CONSTRAINT "GoalMovement_automationRuleId_fkey"
  FOREIGN KEY ("automationRuleId") REFERENCES "GoalAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
