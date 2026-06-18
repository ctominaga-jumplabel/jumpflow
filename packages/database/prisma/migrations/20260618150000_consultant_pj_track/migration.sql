-- Consultores (Story 4): trilha PJ — contratacao + faturamento
-- (ConsultantPjInfo 1:1) e responsavel legal (ConsultantLegalRepresentative
-- 1:1). Migracao puramente aditiva: um enum e duas tabelas novas. Nenhuma
-- estrutura existente e alterada.

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('NFSE', 'NFE', 'RPA', 'OTHER');

-- CreateTable
CREATE TABLE "ConsultantPjInfo" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "contractTermMonths" INTEGER,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "issuesInvoice" BOOLEAN NOT NULL DEFAULT true,
    "invoiceType" "InvoiceType",
    "issuingMunicipality" TEXT,
    "issRate" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantPjInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantPjInfo_consultantId_key" ON "ConsultantPjInfo"("consultantId");

-- CreateTable
CREATE TABLE "ConsultantLegalRepresentative" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "name" TEXT,
    "cpf" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantLegalRepresentative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantLegalRepresentative_consultantId_key" ON "ConsultantLegalRepresentative"("consultantId");

-- AddForeignKey
ALTER TABLE "ConsultantPjInfo" ADD CONSTRAINT "ConsultantPjInfo_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantLegalRepresentative" ADD CONSTRAINT "ConsultantLegalRepresentative_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
