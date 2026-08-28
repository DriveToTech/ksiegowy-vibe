-- CreateEnum
CREATE TYPE "HouseholdMembershipRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "HouseholdAccountType" AS ENUM ('CURRENT', 'SAVINGS', 'CREDIT_CARD', 'CASH');

-- CreateEnum
CREATE TYPE "HouseholdAccountVisibility" AS ENUM ('SHARED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "HouseholdTransactionCategorizationSource" AS ENUM ('MANUAL', 'RULE', 'IMPORT');

-- CreateEnum
CREATE TYPE "CommitmentType" AS ENUM ('INSURANCE', 'LOAN', 'SUBSCRIPTION', 'UTILITY', 'OTHER');

-- CreateEnum
CREATE TYPE "CommitmentBillingFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CategorizationRuleMatchType" AS ENUM ('EXACT', 'SUBSTRING');

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Household_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdMembership" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "displayName" TEXT,
    "role" "HouseholdMembershipRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdAccount" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HouseholdAccountType" NOT NULL,
    "accountNumberMask" TEXT,
    "visibility" "HouseholdAccountVisibility" NOT NULL DEFAULT 'SHARED',
    "ownerUserId" TEXT,
    "openingBalance" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(15,2),
    "statementDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdCategory" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HouseholdTransaction" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "payee" TEXT NOT NULL,
    "payerUserId" TEXT,
    "bankDescription" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" DATE NOT NULL,
    "tag" TEXT,
    "note" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "commitmentId" TEXT,
    "categorizationSource" "HouseholdTransactionCategorizationSource" NOT NULL DEFAULT 'MANUAL',
    "importBatchId" TEXT,
    "transferGroupId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HouseholdTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetEnvelope" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "monthlyLimit" DECIMAL(15,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commitment" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "CommitmentType" NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "billingFrequency" "CommitmentBillingFrequency" NOT NULL,
    "nextDueDate" DATE NOT NULL,
    "status" "CommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "provider" TEXT,
    "policyNumber" TEXT,
    "insuredObject" TEXT,
    "sumInsured" DECIMAL(15,2),
    "coverBreakdown" JSONB,
    "principal" DECIMAL(15,2),
    "outstandingBalance" DECIMAL(15,2),
    "interestRate" DECIMAL(5,4),
    "termMonths" INTEGER,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Commitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizationRule" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "matchType" "CategorizationRuleMatchType" NOT NULL,
    "payeePattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategorizationRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HouseholdMembership_userId_idx" ON "HouseholdMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMembership_householdId_userId_key" ON "HouseholdMembership"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdMembership_householdId_userEmail_key" ON "HouseholdMembership"("householdId", "userEmail");

-- CreateIndex
CREATE INDEX "HouseholdAccount_householdId_idx" ON "HouseholdAccount"("householdId");

-- CreateIndex
CREATE INDEX "HouseholdAccount_householdId_visibility_idx" ON "HouseholdAccount"("householdId", "visibility");

-- CreateIndex
CREATE INDEX "HouseholdCategory_householdId_idx" ON "HouseholdCategory"("householdId");

-- CreateIndex
CREATE INDEX "HouseholdCategory_parentCategoryId_idx" ON "HouseholdCategory"("parentCategoryId");

-- CreateIndex
CREATE INDEX "HouseholdTransaction_householdId_date_idx" ON "HouseholdTransaction"("householdId", "date");

-- CreateIndex
CREATE INDEX "HouseholdTransaction_householdId_categoryId_date_idx" ON "HouseholdTransaction"("householdId", "categoryId", "date");

-- CreateIndex
CREATE INDEX "HouseholdTransaction_accountId_date_idx" ON "HouseholdTransaction"("accountId", "date");

-- CreateIndex
CREATE INDEX "HouseholdTransaction_transferGroupId_idx" ON "HouseholdTransaction"("transferGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdTransaction_commitmentId_date_key" ON "HouseholdTransaction"("commitmentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetEnvelope_categoryId_key" ON "BudgetEnvelope"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetEnvelope_householdId_categoryId_key" ON "BudgetEnvelope"("householdId", "categoryId");

-- CreateIndex
CREATE INDEX "Commitment_householdId_idx" ON "Commitment"("householdId");

-- CreateIndex
CREATE INDEX "Commitment_householdId_status_idx" ON "Commitment"("householdId", "status");

-- CreateIndex
CREATE INDEX "Commitment_householdId_nextDueDate_idx" ON "Commitment"("householdId", "nextDueDate");

-- CreateIndex
CREATE INDEX "CategorizationRule_householdId_idx" ON "CategorizationRule"("householdId");

-- CreateIndex
CREATE INDEX "CategorizationRule_householdId_matchType_idx" ON "CategorizationRule"("householdId", "matchType");

-- AddForeignKey
ALTER TABLE "HouseholdMembership" ADD CONSTRAINT "HouseholdMembership_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdAccount" ADD CONSTRAINT "HouseholdAccount_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdCategory" ADD CONSTRAINT "HouseholdCategory_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdCategory" ADD CONSTRAINT "HouseholdCategory_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "HouseholdCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdTransaction" ADD CONSTRAINT "HouseholdTransaction_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdTransaction" ADD CONSTRAINT "HouseholdTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HouseholdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdTransaction" ADD CONSTRAINT "HouseholdTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HouseholdCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HouseholdTransaction" ADD CONSTRAINT "HouseholdTransaction_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "Commitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetEnvelope" ADD CONSTRAINT "BudgetEnvelope_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetEnvelope" ADD CONSTRAINT "BudgetEnvelope_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HouseholdCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commitment" ADD CONSTRAINT "Commitment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "HouseholdAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizationRule" ADD CONSTRAINT "CategorizationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HouseholdCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
