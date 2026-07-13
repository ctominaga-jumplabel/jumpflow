-- Onda D (Frente 2). Fluxo de ausencia: pedido -> aprovacao -> TimeEntry
-- materializado; vinculo por FK soft em TimeEntry (timeOffId).
-- Mudanca 100% aditiva: nenhuma coluna/tabela e removida; todos os campos novos
-- sao opcionais ou tem DEFAULT (seguro para linhas existentes).
--
-- ATENCAO (gotcha do repo): `ALTER TYPE ... ADD VALUE` NAO roda dentro de uma
-- transacao e TRAVA no connection pooler do Supabase (pgbouncer). NAO aplicar
-- esta migration inteira pelo migrate engine no pooler. Padrao ja usado no
-- projeto: aplicar os statements isoladamente via PrismaClient
-- `$executeRawUnsafe` (um comando por chamada, sem BEGIN/COMMIT), rodando os
-- tres `ADD VALUE` PRIMEIRO (cada um em statement proprio), e depois os
-- ALTER TABLE / CREATE INDEX / ADD CONSTRAINT; ao final, registrar a migration
-- manualmente em `_prisma_migrations`. Os `ADD VALUE` devem ser commitados/
-- aplicados ANTES de qualquer uso dos novos valores.
-- Aplicar ANTES de mergear na main (gate de deploy).

-- AlterEnum: novos estados do fluxo de ausencia (statements isolados).
ALTER TYPE "TimeOffStatus" ADD VALUE 'REQUESTED';
ALTER TYPE "TimeOffStatus" ADD VALUE 'REJECTED';

-- AlterEnum: ausencia passa a ser uma entidade aprovavel.
ALTER TYPE "ApprovableEntityType" ADD VALUE 'TIME_OFF';

-- AlterTable: trilha de pedido/decisao, remuneracao, vinculo com ferias e dias uteis.
ALTER TABLE "ConsultantTimeOff" ADD COLUMN     "paid" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "requestedByUserId" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "approvedByUserId" TEXT,
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decisionComment" TEXT,
ADD COLUMN     "vacationId" TEXT,
ADD COLUMN     "workingDays" INTEGER;

-- AlterTable: vinculo soft do lancamento com a ausencia de origem.
ALTER TABLE "TimeEntry" ADD COLUMN     "timeOffId" TEXT;

-- CreateIndex
CREATE INDEX "ConsultantTimeOff_vacationId_idx" ON "ConsultantTimeOff"("vacationId");

-- CreateIndex
CREATE INDEX "TimeEntry_timeOffId_idx" ON "TimeEntry"("timeOffId");

-- AddForeignKey
ALTER TABLE "ConsultantTimeOff" ADD CONSTRAINT "ConsultantTimeOff_vacationId_fkey" FOREIGN KEY ("vacationId") REFERENCES "ConsultantVacation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_timeOffId_fkey" FOREIGN KEY ("timeOffId") REFERENCES "ConsultantTimeOff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
