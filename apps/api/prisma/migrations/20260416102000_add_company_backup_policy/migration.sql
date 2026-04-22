-- CreateEnum
CREATE TYPE "CompanyBackupProvider" AS ENUM ('GOOGLE_DRIVE');

-- CreateEnum
CREATE TYPE "CompanyBackupScheduleMode" AS ENUM ('MANUAL', 'DAILY', 'WEEKLY');

-- AlterTable
ALTER TABLE "BackupRun" ADD COLUMN "triggerSource" TEXT;

-- CreateTable
CREATE TABLE "CompanyBackupPolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "provider" "CompanyBackupProvider" NOT NULL DEFAULT 'GOOGLE_DRIVE',
    "automaticOnInvoiceIssued" BOOLEAN NOT NULL DEFAULT false,
    "scheduleMode" "CompanyBackupScheduleMode" NOT NULL DEFAULT 'MANUAL',
    "scheduleHour" INTEGER,
    "scheduleMinute" INTEGER,
    "scheduleDayOfWeek" INTEGER,
    "scheduleTimezone" TEXT NOT NULL DEFAULT 'Europe/Warsaw',
    "lastScheduledRunKey" TEXT,
    "lastScheduledRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyBackupPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanyBackupPolicy_scheduleMode_idx" ON "CompanyBackupPolicy"("scheduleMode");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyBackupPolicy_companyId_provider_key" ON "CompanyBackupPolicy"("companyId", "provider");

-- AddForeignKey
ALTER TABLE "CompanyBackupPolicy" ADD CONSTRAINT "CompanyBackupPolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
