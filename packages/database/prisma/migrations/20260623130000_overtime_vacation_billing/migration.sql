-- Regras de hora extra (3.2) e cobranca em ferias (3.5) — Onda 3.
-- Aditivo: novo enum + colunas em ProjectBillingConfig com defaults seguros
-- (regras existentes mantem comportamento: overtimeAppliesTo=NONE, billDuringVacation=true).
-- Aplicar com `npm run db:deploy` ANTES de mergear na main.

-- CreateEnum
CREATE TYPE "OvertimeAppliesTo" AS ENUM ('NONE', 'CLT', 'PJ', 'BOTH');

-- AlterTable
ALTER TABLE "ProjectBillingConfig"
  ADD COLUMN "overtimeAppliesTo" "OvertimeAppliesTo" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "overtimeBillingPct" DECIMAL(5,2),
  ADD COLUMN "overtimeExcessHours" DECIMAL(10,2),
  ADD COLUMN "overtimeExcessRate" DECIMAL(12,2),
  ADD COLUMN "billDuringVacation" BOOLEAN NOT NULL DEFAULT true;
