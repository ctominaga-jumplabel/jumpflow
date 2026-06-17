-- Motor de regras de faturamento parametrizavel.
-- Migracao puramente aditiva: novas colunas nullable no catalogo BillingType,
-- novos enums e a tabela ProjectBillingConfig (1:1 com Project). Nenhuma coluna
-- existente e alterada/removida, entao e segura para os dados atuais.

-- CreateEnum
CREATE TYPE "BillingPeriodicity" AS ENUM ('MONTHLY', 'BIWEEKLY', 'WEEKLY', 'PER_EVENT');

-- CreateEnum
CREATE TYPE "OverageTreatment" AS ENUM ('BILL_EXTRA', 'BLOCK_AT_LIMIT', 'INCLUDE_FREE', 'CARRY_OVER');

-- CreateEnum
CREATE TYPE "AdjustmentIndex" AS ENUM ('NONE', 'IPCA', 'IGPM', 'CDI', 'FIXED');

-- AlterTable
ALTER TABLE "BillingType" ADD COLUMN "howItWorks" TEXT;
ALTER TABLE "BillingType" ADD COLUMN "example" TEXT;

-- CreateTable
CREATE TABLE "ProjectBillingConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "periodicity" "BillingPeriodicity" NOT NULL DEFAULT 'MONTHLY',
    "roundingRule" "BillingRoundingRule" NOT NULL DEFAULT 'NONE',
    "fixedAmount" DECIMAL(12,2),
    "includedHours" DECIMAL(10,2),
    "overageRate" DECIMAL(12,2),
    "overageTreatment" "OverageTreatment" NOT NULL DEFAULT 'BILL_EXTRA',
    "perConsultantAmount" DECIMAL(12,2),
    "reimbursableExpenses" BOOLEAN NOT NULL DEFAULT false,
    "reimbursableMarkupPct" DECIMAL(5,2),
    "discountPct" DECIMAL(5,2),
    "penaltyPct" DECIMAL(5,2),
    "adjustmentIndex" "AdjustmentIndex" NOT NULL DEFAULT 'NONE',
    "adjustmentPct" DECIMAL(7,4),
    "withholdIss" BOOLEAN NOT NULL DEFAULT false,
    "withholdingPct" DECIMAL(5,2),
    "closingDay" INTEGER,
    "dueDay" INTEGER,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "parameters" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectBillingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBillingConfig_projectId_key" ON "ProjectBillingConfig"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectBillingConfig" ADD CONSTRAINT "ProjectBillingConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
