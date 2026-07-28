-- Cockpit do Gestor de Area (Fase 1): flag de obrigatoriedade de lancamento
-- diario por projeto. Quando true, o consultor deve lancar em todo dia util e e
-- cobrado semanalmente (motor MISSING_TIMESHEET_REPORT); quando false, sem
-- cobranca, apenas indicador informativo. Nasce true para preservar o
-- comportamento atual de todos os projetos existentes.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "dailyEntryRequired" BOOLEAN NOT NULL DEFAULT true;
