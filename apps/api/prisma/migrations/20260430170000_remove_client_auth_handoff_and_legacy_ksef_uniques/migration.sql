-- DropForeignKey
ALTER TABLE "ClientAuthHandoff" DROP CONSTRAINT "ClientAuthHandoff_userId_fkey";

-- DropIndex
DROP INDEX "KsefSession_companyId_key";

-- DropIndex
DROP INDEX "KsefSubmission_invoiceId_attemptNumber_key";

-- DropTable
DROP TABLE "ClientAuthHandoff";
