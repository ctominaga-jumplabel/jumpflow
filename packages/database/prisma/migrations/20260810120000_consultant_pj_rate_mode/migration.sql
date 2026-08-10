-- Modo de pagamento do consultor PJ: por hora (valor/hora x horas aprovadas) ou
-- fixo mensal, escolhido por consultor. Aditivo e seguro:
--   1. cria o enum PjRateMode (tipo novo, sem impacto em dados existentes);
--   2. adiciona ConsultantCompensation.pjRateMode como coluna NULLABLE.
-- Registros existentes ficam NULL; o backend trata NULL como FIXED por
-- compatibilidade. Aplica-se apenas quando contractType = PJ.

-- CreateEnum
CREATE TYPE "PjRateMode" AS ENUM ('HOURLY', 'FIXED');

-- AlterTable
ALTER TABLE "ConsultantCompensation" ADD COLUMN "pjRateMode" "PjRateMode";

-- Backfill: preserva o comportamento legado. Antes desta feature, um PJ com
-- hourlyRate preenchido era pago POR HORA (horas aprovadas x taxa). Marcamos
-- esses como HOURLY; os demais PJ ficam NULL (= FIXED no backend).
UPDATE "ConsultantCompensation"
  SET "pjRateMode" = 'HOURLY'
  WHERE "contractType" = 'PJ' AND "hourlyRate" IS NOT NULL;
