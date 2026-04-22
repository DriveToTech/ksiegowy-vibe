-- CreateEnum
CREATE TYPE "CompanyVatStatus" AS ENUM ('ACTIVE', 'EXEMPT', 'NO_VAT');

-- CreateEnum
CREATE TYPE "KsefEnvironment" AS ENUM ('TEST', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "CompanyMembershipRole" AS ENUM ('ADMIN', 'ACCOUNTANT', 'VIEWER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT_TO_KSEF', 'KSEF_ACCEPTED', 'KSEF_REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('VAT', 'KOR', 'ZAL', 'ROZ', 'UPR');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PRZELEW', 'GOTOWKA', 'KARTA', 'INNA');

-- CreateEnum
CREATE TYPE "InvoiceKsefStatus" AS ENUM ('NOT_SENT', 'QUEUED', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'OFFLINE_QUEUED');

-- CreateEnum
CREATE TYPE "KsefSubmissionStatus" AS ENUM ('PENDING', 'SUBMITTED', 'ACCEPTED', 'REJECTED', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "googleId" TEXT,
    "avatarUrl" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "bankName" TEXT,
    "bankAccount" TEXT,
    "vatStatus" "CompanyVatStatus" NOT NULL DEFAULT 'ACTIVE',
    "invoiceSeq" JSONB NOT NULL DEFAULT '{}',
    "ksefTokenEnc" TEXT,
    "ksefTokenIv" TEXT,
    "ksefEnv" "KsefEnvironment" NOT NULL DEFAULT 'TEST',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyMembership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "CompanyMembershipRole" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contractor" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nip" TEXT,
    "pesel" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'PL',
    "email" TEXT,
    "phone" TEXT,
    "bankAccount" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contractor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractorId" TEXT,
    "invoiceNumber" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "invoiceType" "InvoiceType" NOT NULL DEFAULT 'VAT',
    "issueDate" TIMESTAMP(3) NOT NULL,
    "saleDate" TIMESTAMP(3),
    "placeOfIssue" TEXT NOT NULL DEFAULT 'Wrocław',
    "sellerName" TEXT,
    "sellerNip" TEXT,
    "sellerAddress1" TEXT,
    "sellerAddress2" TEXT,
    "sellerEmail" TEXT,
    "sellerPhone" TEXT,
    "sellerBank" TEXT,
    "sellerAccount" TEXT,
    "buyerName" TEXT,
    "buyerNip" TEXT,
    "buyerAddress1" TEXT,
    "buyerAddress2" TEXT,
    "buyerCountry" TEXT NOT NULL DEFAULT 'PL',
    "totalNet" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalVat" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalGross" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paymentReceived" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'PRZELEW',
    "paymentDueDate" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "notes" TEXT,
    "correctedInvoiceId" TEXT,
    "correctedKsefRef" TEXT,
    "ksefReference" TEXT,
    "ksefStatus" "InvoiceKsefStatus" NOT NULL DEFAULT 'NOT_SENT',
    "ksefSubmittedAt" TIMESTAMP(3),
    "ksefAcceptedAt" TIMESTAMP(3),
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT DEFAULT 'szt',
    "quantity" DECIMAL(15,4) NOT NULL,
    "unitNetPrice" DECIMAL(15,4) NOT NULL,
    "vatRate" TEXT NOT NULL,
    "netValue" DECIMAL(15,2) NOT NULL,
    "vatValue" DECIMAL(15,2) NOT NULL,
    "grossValue" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceVatBreakdown" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "vatRate" TEXT NOT NULL,
    "netAmount" DECIMAL(15,2) NOT NULL,
    "vatAmount" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "InvoiceVatBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KsefSubmission" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "status" "KsefSubmissionStatus" NOT NULL,
    "referenceNumber" TEXT,
    "ksefReference" TEXT,
    "requestHash" TEXT,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "httpStatusCode" INTEGER,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KsefSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KsefSession" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "tokenIv" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KsefSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_nip_key" ON "Company"("nip");

-- CreateIndex
CREATE INDEX "CompanyMembership_userId_idx" ON "CompanyMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyMembership_companyId_userId_key" ON "CompanyMembership"("companyId", "userId");

-- CreateIndex
CREATE INDEX "Contractor_companyId_name_idx" ON "Contractor"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Contractor_companyId_nip_key" ON "Contractor"("companyId", "nip");

-- CreateIndex
CREATE INDEX "Invoice_companyId_issueDate_idx" ON "Invoice"("companyId", "issueDate");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_companyId_ksefStatus_idx" ON "Invoice"("companyId", "ksefStatus");

-- CreateIndex
CREATE INDEX "Invoice_contractorId_idx" ON "Invoice"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_companyId_invoiceNumber_key" ON "Invoice"("companyId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceLine_invoiceId_position_key" ON "InvoiceLine"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceVatBreakdown_invoiceId_vatRate_key" ON "InvoiceVatBreakdown"("invoiceId", "vatRate");

-- CreateIndex
CREATE INDEX "KsefSubmission_companyId_status_idx" ON "KsefSubmission"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KsefSubmission_invoiceId_attemptNumber_key" ON "KsefSubmission"("invoiceId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "KsefSession_companyId_key" ON "KsefSession"("companyId");

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyMembership" ADD CONSTRAINT "CompanyMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contractor" ADD CONSTRAINT "Contractor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_correctedInvoiceId_fkey" FOREIGN KEY ("correctedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceVatBreakdown" ADD CONSTRAINT "InvoiceVatBreakdown_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KsefSubmission" ADD CONSTRAINT "KsefSubmission_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KsefSubmission" ADD CONSTRAINT "KsefSubmission_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KsefSession" ADD CONSTRAINT "KsefSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
