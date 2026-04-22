-- CreateEnum
CREATE TYPE "IncomingInvoiceStatus" AS ENUM ('UPLOADED', 'OCR_PROCESSING', 'OCR_DONE', 'OCR_FAILED', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "FileRecord" ADD COLUMN     "incomingInvoiceId" TEXT;

-- CreateTable
CREATE TABLE "IncomingInvoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contractorId" TEXT,
    "status" "IncomingInvoiceStatus" NOT NULL DEFAULT 'UPLOADED',
    "sellerName" TEXT,
    "sellerNip" TEXT,
    "sellerAddress" TEXT,
    "buyerName" TEXT,
    "buyerNip" TEXT,
    "invoiceNumber" TEXT,
    "issueDate" TIMESTAMP(3),
    "saleDate" TIMESTAMP(3),
    "totalNet" DECIMAL(15,2),
    "totalVat" DECIMAL(15,2),
    "totalGross" DECIMAL(15,2),
    "currency" TEXT DEFAULT 'PLN',
    "paymentMethod" TEXT,
    "dueDate" TIMESTAMP(3),
    "bankAccount" TEXT,
    "notes" TEXT,
    "lineItemsJson" JSONB,
    "ocrConfidence" DOUBLE PRECISION,
    "ocrWarnings" JSONB,
    "ocrModel" TEXT,
    "ocrError" TEXT,
    "ksefReference" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncomingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoogleDriveCredential" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "credentialsEnc" TEXT NOT NULL,
    "credentialsIv" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastBackupAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleDriveCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "companyId" TEXT,
    "status" TEXT NOT NULL,
    "filesCount" INTEGER NOT NULL DEFAULT 0,
    "bytesTotal" BIGINT NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncomingInvoice_companyId_idx" ON "IncomingInvoice"("companyId");

-- CreateIndex
CREATE INDEX "IncomingInvoice_companyId_status_idx" ON "IncomingInvoice"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoogleDriveCredential_companyId_key" ON "GoogleDriveCredential"("companyId");

-- CreateIndex
CREATE INDEX "BackupRun_provider_idx" ON "BackupRun"("provider");

-- CreateIndex
CREATE INDEX "BackupRun_companyId_idx" ON "BackupRun"("companyId");

-- CreateIndex
CREATE INDEX "FileRecord_incomingInvoiceId_idx" ON "FileRecord"("incomingInvoiceId");

-- AddForeignKey
ALTER TABLE "FileRecord" ADD CONSTRAINT "FileRecord_incomingInvoiceId_fkey" FOREIGN KEY ("incomingInvoiceId") REFERENCES "IncomingInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomingInvoice" ADD CONSTRAINT "IncomingInvoice_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoogleDriveCredential" ADD CONSTRAINT "GoogleDriveCredential_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
