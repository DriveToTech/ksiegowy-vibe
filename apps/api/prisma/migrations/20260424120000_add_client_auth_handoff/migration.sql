-- CreateTable
CREATE TABLE "ClientAuthHandoff" (
    "id" TEXT NOT NULL,
    "handoffCodeHash" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAuthHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientAuthHandoff_handoffCodeHash_key" ON "ClientAuthHandoff"("handoffCodeHash");

-- CreateIndex
CREATE INDEX "ClientAuthHandoff_expiresAt_idx" ON "ClientAuthHandoff"("expiresAt");

-- AddForeignKey
ALTER TABLE "ClientAuthHandoff"
ADD CONSTRAINT "ClientAuthHandoff_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
