-- CreateEnum
CREATE TYPE "AdvisorProvider" AS ENUM ('OPENROUTER', 'OPENAI', 'ANTHROPIC', 'OLLAMA');

-- CreateEnum
CREATE TYPE "AdvisorTurnStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdvisorConnectorClient" AS ENUM ('CHATGPT', 'CLAUDE');

-- CreateTable
CREATE TABLE "CompanyAdvisorPolicy" (
    "companyId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "allowedProviders" "AdvisorProvider"[] DEFAULT ARRAY[]::"AdvisorProvider"[],
    "allowedConnectors" "AdvisorConnectorClient"[] DEFAULT ARRAY[]::"AdvisorConnectorClient"[],
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAdvisorPolicy_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "AdvisorConnectorGrant" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "environment" "KsefEnvironment" NOT NULL,
    "client" "AdvisorConnectorClient" NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientIdentifier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorConnectorGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorConnection" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "provider" "AdvisorProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "credentialEncrypted" TEXT,
    "credentialNonce" TEXT,
    "testedAt" TIMESTAMP(3),
    "lastRequestedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorConversation" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "environment" "KsefEnvironment" NOT NULL,
    "provider" "AdvisorProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdvisorConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvisorTurn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "status" "AdvisorTurnStatus" NOT NULL DEFAULT 'PENDING',
    "answer" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AdvisorTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdvisorConnectorGrant_expiresAt_idx" ON "AdvisorConnectorGrant"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorConnectorGrant_membershipId_environment_client_key" ON "AdvisorConnectorGrant"("membershipId", "environment", "client");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorConnection_membershipId_provider_key" ON "AdvisorConnection"("membershipId", "provider");

-- CreateIndex
CREATE INDEX "AdvisorConversation_membershipId_environment_createdAt_idx" ON "AdvisorConversation"("membershipId", "environment", "createdAt");

-- CreateIndex
CREATE INDEX "AdvisorConversation_expiresAt_idx" ON "AdvisorConversation"("expiresAt");

-- CreateIndex
CREATE INDEX "AdvisorTurn_conversationId_createdAt_idx" ON "AdvisorTurn"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdvisorTurn_conversationId_requestId_key" ON "AdvisorTurn"("conversationId", "requestId");

-- AddForeignKey
ALTER TABLE "CompanyAdvisorPolicy" ADD CONSTRAINT "CompanyAdvisorPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorConnectorGrant" ADD CONSTRAINT "AdvisorConnectorGrant_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorConnection" ADD CONSTRAINT "AdvisorConnection_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorConversation" ADD CONSTRAINT "AdvisorConversation_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "CompanyMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvisorTurn" ADD CONSTRAINT "AdvisorTurn_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AdvisorConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
