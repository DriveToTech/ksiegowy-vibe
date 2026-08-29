-- CreateEnum
CREATE TYPE "HouseholdCategoryCashFlowTreatment" AS ENUM ('STANDARD', 'TRANSFER');

-- AlterTable
ALTER TABLE "HouseholdCategory"
  ADD COLUMN "cashFlowTreatment" "HouseholdCategoryCashFlowTreatment" NOT NULL DEFAULT 'STANDARD';

-- Existing households receive the same safe, non-cash-flow category that new
-- households get from the application seed. The stable id makes this insert
-- safe to rerun during a recovery or a partially applied deployment.
INSERT INTO "HouseholdCategory" ("id", "householdId", "name", "cashFlowTreatment", "createdAt", "updatedAt")
SELECT 'investment-transfer-' || household."id", household."id", 'Investment transfers', 'TRANSFER', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Household" household
WHERE NOT EXISTS (
  SELECT 1
  FROM "HouseholdCategory" category
  WHERE category."householdId" = household."id"
    AND category."name" = 'Investment transfers'
);

-- Close the tenancy gap in category references. Existing ledger rows are
-- preserved and safely uncategorized; invalid rules/envelopes fail closed so
-- deployment cannot silently move financial configuration between households.
UPDATE "HouseholdTransaction" ledger_transaction
SET "categoryId" = NULL
WHERE ledger_transaction."categoryId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "HouseholdCategory" category
    WHERE category."id" = ledger_transaction."categoryId"
      AND category."householdId" = ledger_transaction."householdId"
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CategorizationRule" categorization_rule
    LEFT JOIN "HouseholdCategory" category
      ON category."id" = categorization_rule."categoryId"
     AND category."householdId" = categorization_rule."householdId"
    WHERE category."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add household-scoped category constraint: invalid categorization rule exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "BudgetEnvelope" budget_envelope
    LEFT JOIN "HouseholdCategory" category
      ON category."id" = budget_envelope."categoryId"
     AND category."householdId" = budget_envelope."householdId"
    WHERE category."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot add household-scoped category constraint: invalid budget envelope exists';
  END IF;
END $$;

-- The old single-column foreign keys allowed a category from another
-- household to be attached to a transaction, rule, or envelope.
ALTER TABLE "HouseholdTransaction" DROP CONSTRAINT IF EXISTS "HouseholdTransaction_categoryId_fkey";
ALTER TABLE "CategorizationRule" DROP CONSTRAINT IF EXISTS "CategorizationRule_categoryId_fkey";
ALTER TABLE "BudgetEnvelope" DROP CONSTRAINT IF EXISTS "BudgetEnvelope_categoryId_fkey";
CREATE UNIQUE INDEX "HouseholdCategory_householdId_id_key" ON "HouseholdCategory"("householdId", "id");
ALTER TABLE "HouseholdTransaction" ADD CONSTRAINT "HouseholdTransaction_householdId_categoryId_fkey"
  FOREIGN KEY ("householdId", "categoryId") REFERENCES "HouseholdCategory"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_householdId_categoryId_fkey"
  FOREIGN KEY ("householdId", "categoryId") REFERENCES "HouseholdCategory"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetEnvelope" ADD CONSTRAINT "BudgetEnvelope_householdId_categoryId_fkey"
  FOREIGN KEY ("householdId", "categoryId") REFERENCES "HouseholdCategory"("householdId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "InvestmentWrapper" AS ENUM ('TAXABLE', 'IKE', 'IKZE');

-- CreateEnum
CREATE TYPE "InvestmentPositionVisibility" AS ENUM ('SHARED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "InvestmentTransactionType" AS ENUM ('BUY', 'SELL', 'VALUATION_UPDATE', 'CONTRIBUTION');

-- CreateTable
CREATE TABLE "InvestmentPosition" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "wrapper" "InvestmentWrapper" NOT NULL,
    "visibility" "InvestmentPositionVisibility" NOT NULL DEFAULT 'PRIVATE',
    "instrument" TEXT NOT NULL,
    "units" DECIMAL(20,8) NOT NULL,
    "costBasis" DECIMAL(15,2) NOT NULL,
    "currentValue" DECIMAL(15,2),
    "targetAllocationPercent" DECIMAL(5,2),
    "lastValuedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentPosition_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvestmentPosition_units_nonnegative_check" CHECK ("units" >= 0),
    CONSTRAINT "InvestmentPosition_costBasis_nonnegative_check" CHECK ("costBasis" >= 0),
    CONSTRAINT "InvestmentPosition_currentValue_nonnegative_check" CHECK ("currentValue" IS NULL OR "currentValue" >= 0),
    CONSTRAINT "InvestmentPosition_targetAllocationPercent_check" CHECK ("targetAllocationPercent" IS NULL OR "targetAllocationPercent" BETWEEN 0 AND 100)
);

-- CreateTable
CREATE TABLE "InvestmentTransaction" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "type" "InvestmentTransactionType" NOT NULL,
    "units" DECIMAL(20,8),
    "amount" DECIMAL(15,2) NOT NULL,
    "date" DATE NOT NULL,
    "operationId" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvestmentTransaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InvestmentTransaction_amount_nonnegative_check" CHECK ("amount" >= 0),
    CONSTRAINT "InvestmentTransaction_units_shape_check" CHECK (
      ("type" IN ('BUY', 'SELL') AND "units" IS NOT NULL AND "units" > 0)
      OR ("type" IN ('VALUATION_UPDATE', 'CONTRIBUTION') AND "units" IS NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentPosition_householdId_id_key" ON "InvestmentPosition"("householdId", "id");
CREATE INDEX "InvestmentPosition_householdId_visibility_idx" ON "InvestmentPosition"("householdId", "visibility");
CREATE INDEX "InvestmentPosition_householdId_archivedAt_idx" ON "InvestmentPosition"("householdId", "archivedAt");
CREATE INDEX "InvestmentPosition_ownerUserId_idx" ON "InvestmentPosition"("ownerUserId");
CREATE UNIQUE INDEX "InvestmentTransaction_householdId_operationId_key" ON "InvestmentTransaction"("householdId", "operationId");
CREATE INDEX "InvestmentTransaction_householdId_positionId_date_idx" ON "InvestmentTransaction"("householdId", "positionId", "date");
CREATE INDEX "InvestmentTransaction_positionId_voidedAt_idx" ON "InvestmentTransaction"("positionId", "voidedAt");

-- AddForeignKey
ALTER TABLE "InvestmentPosition" ADD CONSTRAINT "InvestmentPosition_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvestmentTransaction" ADD CONSTRAINT "InvestmentTransaction_position_fkey"
  FOREIGN KEY ("householdId", "positionId") REFERENCES "InvestmentPosition"("householdId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
