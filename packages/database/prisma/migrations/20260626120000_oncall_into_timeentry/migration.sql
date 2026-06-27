-- Melhoria #2: Sobreaviso vira Atividade na tela de Horas (FUNDACAO).
--
-- Etapa de schema + migracao de dados. NAO mexe em revenue/payment nem nas
-- telas (outras etapas cuidam disso). Decisoes de produto ja validadas:
--   * Consultor sempre pago pelo equivalente (effectiveHours = hours x multiplier).
--   * Faturamento respeita a flag `billable` de cada lancamento.
--   * Migrar SO OnCallEntry COM projeto; orfaos (projectId IS NULL) ficam no
--     legado e saem em relatorio (NAO sao migrados).
--   * ON_CALL sempre exige aprovacao humana (relevante so para a etapa de
--     auto-aprovacao; aqui o status migrado e SUBMITTED, nunca auto-APPROVED).
--
-- IMPORTANTE (gotcha do projeto): o migrate engine do Prisma TRAVA no pooler do
-- Supabase. Em producao, aplicar via scripts/migrate-oncall-into-timeentry.mjs
-- (PrismaClient.$executeRawUnsafe) + registro manual em _prisma_migrations.
-- Este migration.sql e idempotente e e a fonte canonica do DDL + data move.
-- NAO rodar db:deploy em prod nesta etapa.
--
-- GUARDAS DE RISCO (mitigacoes da revisao):
--   M1 (overflow de precisao): OnCallEntry.hours e Decimal(6,2) (ate 9999.99),
--     mas TimeEntry.hours e Decimal(5,2) (ate 999.99). Um lancamento com
--     hours >= 1000 estouraria o INSERT (numeric field overflow) e abortaria a
--     etapa. O SCRIPT de deploy (.mjs) faz a checagem `SELECT max(hours)` ANTES
--     de aplicar e ABORTA com mensagem clara se exceder 999.99. Ao rodar este
--     SQL manualmente, faca a mesma checagem antes.
--   M2 (JOIN por data): as etapas 2 e 3 derivam a segunda-feira da semana com a
--     EXATA mesma expressao (CROSS JOIN LATERAL ... week_start), e a etapa 3
--     casa o periodo por `tp.startDate = wk.week_start`. Isso elimina o risco de
--     descarte silencioso por divergencia de timezone/calculo. O .mjs ainda
--     conta, na verificacao final, quantos OnCallEntry COM projeto NAO geraram
--     TimeEntry e reporta como "descartados inesperadamente" (distinto de orfaos
--     sem projeto).

-- =========================================================================
-- 1. DDL
-- =========================================================================

-- AlterTable: fator de remuneracao por lancamento (default 1.00 = neutro).
ALTER TABLE "TimeEntry"
  ADD COLUMN IF NOT EXISTS "multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.00;

-- CreateTable: anexo generico 1:1 do lancamento (sucede OnCallAttachment).
CREATE TABLE IF NOT EXISTS "TimeEntryAttachment" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntryAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "TimeEntryAttachment_timeEntryId_key"
  ON "TimeEntryAttachment"("timeEntryId");

-- AddForeignKey (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntryAttachment_timeEntryId_fkey'
  ) THEN
    ALTER TABLE "TimeEntryAttachment"
      ADD CONSTRAINT "TimeEntryAttachment_timeEntryId_fkey"
      FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- =========================================================================
-- 2. Garantir TimesheetPeriod (semana ISO seg->dom em UTC) para cada
--    (consultantId, semana da OnCallEntry COM projeto). Sem orfaos.
--    Janela: [seg 00:00Z, dom 00:00Z], status DRAFT, id determinístico.
-- =========================================================================
INSERT INTO "TimesheetPeriod" ("id", "consultantId", "startDate", "endDate", "status", "createdAt", "updatedAt")
SELECT
  'mig-ocp-' || oc."consultantId" || '-' || to_char(wk.week_start, 'YYYYMMDD') AS id,
  oc."consultantId",
  wk.week_start,
  wk.week_start + INTERVAL '6 days',
  'DRAFT',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "OnCallEntry" oc
CROSS JOIN LATERAL (
  -- segunda-feira da semana ISO da data (date_trunc('week') = segunda em PG)
  SELECT date_trunc('week', (oc."date" AT TIME ZONE 'UTC'))::date::timestamp AS week_start
) wk
WHERE oc."projectId" IS NOT NULL
GROUP BY oc."consultantId", wk.week_start
ON CONFLICT ("consultantId", "startDate", "endDate") DO NOTHING;

-- =========================================================================
-- 3. Migrar OnCallEntry COM projeto -> TimeEntry (activityType ON_CALL).
--    id determinístico mig-oc-<onCallEntryId> (idempotente). Mapeamento de
--    status: OnCall PENDING/APPROVED/REJECTED -> TimeEntry SUBMITTED.
--    Decisao: tudo entra como SUBMITTED (ON_CALL sempre exige aprovacao
--    humana; a re-aprovacao roda nas telas, fora desta etapa).
--    billable = false por padrao para ON_CALL migrado (confirmar com finance).
-- =========================================================================
INSERT INTO "TimeEntry" (
  "id", "periodId", "consultantId", "projectId", "allocationId",
  "date", "hours", "multiplier", "activityType", "description",
  "billable", "status", "submittedAt", "createdAt", "updatedAt"
)
SELECT
  'mig-oc-' || oc."id" AS id,
  tp."id" AS "periodId",
  oc."consultantId",
  oc."projectId",
  NULL AS "allocationId",
  oc."date",
  oc."hours",
  oc."multiplier",
  'ON_CALL' AS "activityType",
  oc."note" AS "description",
  false AS "billable",
  'SUBMITTED' AS "status",
  oc."createdAt" AS "submittedAt",
  oc."createdAt",
  CURRENT_TIMESTAMP
FROM "OnCallEntry" oc
-- M2: mesma derivacao EXATA da etapa 2; casa o periodo por week_start, nunca por
-- timestamp recalculado de forma independente. Garante que nenhum entry com
-- projeto seja descartado por divergencia de calculo de semana.
CROSS JOIN LATERAL (
  SELECT date_trunc('week', (oc."date" AT TIME ZONE 'UTC'))::date::timestamp AS week_start
) wk
JOIN "TimesheetPeriod" tp
  ON tp."consultantId" = oc."consultantId"
 AND tp."startDate" = wk.week_start
WHERE oc."projectId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

-- =========================================================================
-- 4. Migrar anexos OnCallAttachment -> TimeEntryAttachment, somente para
--    entries que foram migrados (com projeto). id determinístico
--    mig-ocatt-<onCallAttachmentId>.
-- =========================================================================
INSERT INTO "TimeEntryAttachment" (
  "id", "timeEntryId", "fileName", "contentType", "size",
  "storageBucket", "storageKey", "uploadedByUserId", "createdAt"
)
SELECT
  'mig-ocatt-' || att."id" AS id,
  'mig-oc-' || att."onCallEntryId" AS "timeEntryId",
  att."fileName",
  att."contentType",
  att."size",
  att."storageBucket",
  att."storageKey",
  att."uploadedByUserId",
  att."createdAt"
FROM "OnCallAttachment" att
JOIN "OnCallEntry" oc ON oc."id" = att."onCallEntryId"
WHERE oc."projectId" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
