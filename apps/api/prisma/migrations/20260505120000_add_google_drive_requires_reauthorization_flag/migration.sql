-- AlterTable
ALTER TABLE "GoogleDriveCredential"
ADD COLUMN "requiresReauthorization" BOOLEAN NOT NULL DEFAULT false;
