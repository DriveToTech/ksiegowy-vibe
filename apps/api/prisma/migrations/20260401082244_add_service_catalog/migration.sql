-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'szt.',
    "vatRate" TEXT NOT NULL DEFAULT '23',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractorServiceRate" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "serviceTemplateId" TEXT NOT NULL,
    "unitNetPrice" DECIMAL(15,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PLN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractorServiceRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceTemplate_companyId_isActive_idx" ON "ServiceTemplate"("companyId", "isActive");

-- CreateIndex
CREATE INDEX "ContractorServiceRate_contractorId_idx" ON "ContractorServiceRate"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractorServiceRate_contractorId_serviceTemplateId_key" ON "ContractorServiceRate"("contractorId", "serviceTemplateId");

-- AddForeignKey
ALTER TABLE "ServiceTemplate" ADD CONSTRAINT "ServiceTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorServiceRate" ADD CONSTRAINT "ContractorServiceRate_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "Contractor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractorServiceRate" ADD CONSTRAINT "ContractorServiceRate_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
