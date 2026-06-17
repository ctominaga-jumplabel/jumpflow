-- Melhorias: lancamento de horas por relogio de ponto, tipo de cobranca por
-- projeto e vinculo de consultor desativavel.
--
-- This file was generated manually because `prisma migrate dev` in this
-- environment targets the production Supabase database and the network is
-- restricted. The DDL mirrors Prisma's generated output. Apply it with
-- `npm run db:deploy` (prisma migrate deploy) from an environment with database
-- access. All new columns are nullable, so existing rows are preserved.

-- 1) AllocationStatus: novo valor INACTIVE (vinculo desativado, mantido para
-- historico de horas). Postgres so permite adicionar valores ao enum; o valor
-- nao e usado em nenhuma instrucao desta migration, entao e seguro adiciona-lo
-- aqui (nao pode ser usado na mesma transacao em que e criado).
ALTER TYPE "AllocationStatus" ADD VALUE IF NOT EXISTS 'INACTIVE';

-- 2) TimeEntry: horarios de ponto (formato "HH:mm"). `hours` continua sendo a
-- fonte lida por revenue/payment e passa a ser derivado destes horarios.
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "startTime" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "breakStart" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "breakEnd" TEXT;
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "endTime" TEXT;

-- Backfill: descricoes nulas viram string vazia para alinhar com a nova regra de
-- descricao obrigatoria, sem quebrar linhas legadas ja usadas em fechamentos.
UPDATE "TimeEntry" SET "description" = '' WHERE "description" IS NULL;

-- 3) TimesheetDefault: padrao de horario (alimenta a comparacao da aprovacao
-- automatica com o "padrao definido").
ALTER TABLE "TimesheetDefault" ADD COLUMN IF NOT EXISTS "startTime" TEXT;
ALTER TABLE "TimesheetDefault" ADD COLUMN IF NOT EXISTS "breakStart" TEXT;
ALTER TABLE "TimesheetDefault" ADD COLUMN IF NOT EXISTS "breakEnd" TEXT;
ALTER TABLE "TimesheetDefault" ADD COLUMN IF NOT EXISTS "endTime" TEXT;

-- 4) Project: tipo de cobranca por projeto (fallback no Client.billingTypeId
-- quando nulo). FK opcional com ON DELETE SET NULL, espelhando Client.
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "billingTypeId" TEXT;

CREATE INDEX IF NOT EXISTS "Project_billingTypeId_idx" ON "Project"("billingTypeId");

ALTER TABLE "Project"
ADD CONSTRAINT "Project_billingTypeId_fkey"
FOREIGN KEY ("billingTypeId") REFERENCES "BillingType"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
