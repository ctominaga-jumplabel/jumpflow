-- Consultores (Story 3): trilha CLT — contratacao + dados trabalhistas
-- (ConsultantCltInfo 1:1), ferias (ConsultantVacation 1:N) e banco de horas
-- (ConsultantHourBankEntry 1:N, ledger). Migracao puramente aditiva: dois
-- enums e tres tabelas novas. Nenhuma estrutura existente e alterada.

-- CreateEnum
CREATE TYPE "CltContractKind" AS ENUM ('INDEFINITE', 'FIXED_TERM', 'INTERNSHIP', 'APPRENTICESHIP');

-- CreateEnum
CREATE TYPE "HourBankEntryKind" AS ENUM ('OVERTIME', 'COMPENSATION', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "ConsultantCltInfo" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "pisPasep" TEXT,
    "ctpsNumber" TEXT,
    "ctpsSeries" TEXT,
    "admissionDate" TIMESTAMP(3),
    "dismissalDate" TIMESTAMP(3),
    "contractKind" "CltContractKind",
    "workSchedule" TEXT,
    "workShift" TEXT,
    "union" TEXT,
    "registeredRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantCltInfo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantCltInfo_consultantId_key" ON "ConsultantCltInfo"("consultantId");

-- CreateTable
CREATE TABLE "ConsultantVacation" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "accrualPeriodStart" TIMESTAMP(3) NOT NULL,
    "accrualPeriodEnd" TIMESTAMP(3) NOT NULL,
    "entitledDays" INTEGER NOT NULL DEFAULT 30,
    "takenDays" INTEGER NOT NULL DEFAULT 0,
    "balanceDays" INTEGER NOT NULL DEFAULT 30,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantVacation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantVacation_consultantId_accrualPeriodStart_idx" ON "ConsultantVacation"("consultantId", "accrualPeriodStart");

-- CreateTable
CREATE TABLE "ConsultantHourBankEntry" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "kind" "HourBankEntryKind" NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantHourBankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantHourBankEntry_consultantId_occurredAt_idx" ON "ConsultantHourBankEntry"("consultantId", "occurredAt");

-- AddForeignKey
ALTER TABLE "ConsultantCltInfo" ADD CONSTRAINT "ConsultantCltInfo_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantVacation" ADD CONSTRAINT "ConsultantVacation_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantHourBankEntry" ADD CONSTRAINT "ConsultantHourBankEntry_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
