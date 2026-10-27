-- Fluxo de Horas: governança + SLA (parte 2/2). Depende de
-- 20261027115900_fluxo_horas_enum_values (valores de enum já commitados).
--
-- 1. ConsultantPayment: liberação pelo DP/People (peopleReleasedAt/ByUserId) e
--    envio da solicitação de NF pelo Financeiro (invoiceRequestSentAt). Colunas
--    NULLABLE, sem backfill: pagamentos existentes seguem com o status atual.
-- 2. EmailTemplate: template editável por NotificationEvent. Sem linhas
--    semeadas (ausência = template padrão hardcoded do app).
-- 3. SLA: SlaSettings (singleton 'default', pagamento dia 16) + SlaStage com os
--    prazos combinados na reunião do fluxo de horas.
-- 4. Regras de notificação padrão dos novos eventos (só se o evento ainda não
--    tem regra) + FINANCE como destinatário extra da regra padrão de
--    OPERATION_CLOSED (pedido do Financeiro).
-- 5. Matriz de Permissões: novas funcionalidades + grants dos papéis de sistema
--    + VIEW de PAGAMENTOS para PEOPLE (DP passa a liberar pagamentos).
--
-- Aditivo: nada é removido. Os DDL (CREATE TYPE/TABLE, ADD CONSTRAINT) não são
-- reexecutáveis manualmente — o Prisma garante execução única. INSERTs usam ON CONFLICT DO NOTHING
-- ou WHERE NOT EXISTS; células da matriz já existentes NÃO são sobrescritas
-- (exceto PAGAMENTOS × PEOPLE, que só ganha canView = true).

-- ---------------------------------------------------------------------------
-- 1. ConsultantPayment
-- ---------------------------------------------------------------------------
ALTER TABLE "ConsultantPayment" ADD COLUMN IF NOT EXISTS "peopleReleasedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "peopleReleasedByUserId" TEXT,
ADD COLUMN IF NOT EXISTS "invoiceRequestSentAt" TIMESTAMP(3);

ALTER TABLE "ConsultantPayment" ADD CONSTRAINT "ConsultantPayment_peopleReleasedByUserId_fkey" FOREIGN KEY ("peopleReleasedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 2. EmailTemplate
-- ---------------------------------------------------------------------------
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailTemplate_event_key" ON "EmailTemplate"("event");

-- ---------------------------------------------------------------------------
-- 3. SLA
-- ---------------------------------------------------------------------------
CREATE TYPE "SlaProcess" AS ENUM ('HOURS_TO_BILLING', 'HOURS_TO_PAYMENT');
CREATE TYPE "SlaStageKey" AS ENUM ('TIMESHEET_SUBMISSION', 'MANAGER_APPROVAL', 'OPERATION_CLOSING', 'BILLING_RELEASE', 'PEOPLE_PAYMENT_RELEASE', 'INVOICE_REQUEST', 'INVOICE_RECEIPT', 'PAYMENT');
CREATE TYPE "SlaArea" AS ENUM ('CONSULTANT', 'OPERATION', 'PEOPLE', 'FINANCE');
CREATE TYPE "SlaAnchor" AS ENUM ('COMPETENCE_MONTH_END', 'PAYMENT_DATE');

CREATE TABLE "SlaSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "paymentDay" INTEGER NOT NULL DEFAULT 16,
    "considerStateHolidays" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SlaStage" (
    "id" TEXT NOT NULL,
    "process" "SlaProcess" NOT NULL,
    "stageKey" "SlaStageKey" NOT NULL,
    "area" "SlaArea" NOT NULL,
    "label" TEXT NOT NULL,
    "anchor" "SlaAnchor" NOT NULL,
    "businessDays" INTEGER NOT NULL,
    "warningBusinessDays" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaStage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SlaStage_process_active_sortOrder_idx" ON "SlaStage"("process", "active", "sortOrder");
CREATE UNIQUE INDEX "SlaStage_process_stageKey_key" ON "SlaStage"("process", "stageKey");

-- Defaults (espelham seed.mjs → SLA_STAGE_DEFAULTS). Convenção do businessDays:
--   COMPETENCE_MONTH_END: N-ésimo dia útil do mês seguinte (0 = último dia útil
--                         do próprio mês de competência);
--   PAYMENT_DATE:         N dias úteis ANTES do pagamento (0 = no dia).
INSERT INTO "SlaSettings" ("id", "paymentDay", "considerStateHolidays", "createdAt", "updatedAt")
VALUES ('default', 16, false, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "SlaStage" ("id", "process", "stageKey", "area", "label", "anchor", "businessDays", "warningBusinessDays", "sortOrder", "active", "createdAt", "updatedAt")
VALUES
  ('sla_billing_timesheet_submission', 'HOURS_TO_BILLING', 'TIMESHEET_SUBMISSION', 'CONSULTANT', 'Lançamento das horas pelo consultor', 'COMPETENCE_MONTH_END', 0, 1, 10, true, NOW(), NOW()),
  ('sla_billing_manager_approval', 'HOURS_TO_BILLING', 'MANAGER_APPROVAL', 'OPERATION', 'Aprovação das horas pelo gestor', 'COMPETENCE_MONTH_END', 1, 1, 20, true, NOW(), NOW()),
  ('sla_billing_operation_closing', 'HOURS_TO_BILLING', 'OPERATION_CLOSING', 'OPERATION', 'Fechamento operacional', 'COMPETENCE_MONTH_END', 1, 1, 30, true, NOW(), NOW()),
  ('sla_billing_billing_release', 'HOURS_TO_BILLING', 'BILLING_RELEASE', 'OPERATION', 'Liberação para faturamento', 'COMPETENCE_MONTH_END', 1, 1, 40, true, NOW(), NOW()),
  ('sla_payment_timesheet_submission', 'HOURS_TO_PAYMENT', 'TIMESHEET_SUBMISSION', 'CONSULTANT', 'Lançamento das horas pelo consultor', 'COMPETENCE_MONTH_END', 0, 1, 10, true, NOW(), NOW()),
  ('sla_payment_manager_approval', 'HOURS_TO_PAYMENT', 'MANAGER_APPROVAL', 'OPERATION', 'Aprovação das horas pelo gestor', 'COMPETENCE_MONTH_END', 1, 1, 20, true, NOW(), NOW()),
  ('sla_payment_operation_closing', 'HOURS_TO_PAYMENT', 'OPERATION_CLOSING', 'OPERATION', 'Fechamento operacional', 'COMPETENCE_MONTH_END', 1, 1, 30, true, NOW(), NOW()),
  ('sla_payment_people_payment_release', 'HOURS_TO_PAYMENT', 'PEOPLE_PAYMENT_RELEASE', 'PEOPLE', 'Liberação do pagamento pelo DP', 'COMPETENCE_MONTH_END', 4, 1, 40, true, NOW(), NOW()),
  ('sla_payment_invoice_request', 'HOURS_TO_PAYMENT', 'INVOICE_REQUEST', 'FINANCE', 'Solicitação da NF ao consultor', 'PAYMENT_DATE', 5, 1, 50, true, NOW(), NOW()),
  ('sla_payment_invoice_receipt', 'HOURS_TO_PAYMENT', 'INVOICE_RECEIPT', 'CONSULTANT', 'Envio da NF pelo consultor', 'PAYMENT_DATE', 2, 1, 60, true, NOW(), NOW()),
  ('sla_payment_payment', 'HOURS_TO_PAYMENT', 'PAYMENT', 'FINANCE', 'Pagamento ao consultor', 'PAYMENT_DATE', 0, 1, 70, true, NOW(), NOW())
ON CONFLICT ("process", "stageKey") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Regras de notificação padrão (espelham seedNotificationDefaults). Só cria
--    a regra se o evento ainda não tem NENHUMA (edições do ADMIN preservadas).
--    Ids determinísticos para que os destinatários casem com a regra criada
--    aqui — se já existia regra do ADMIN, nada é inserido.
-- ---------------------------------------------------------------------------
INSERT INTO "NotificationRule" ("id", "event", "scope", "scopeId", "channel", "groupByRecipient", "active", "createdAt", "updatedAt")
SELECT v."id", v."event"::"NotificationEvent", 'GLOBAL', NULL, 'EMAIL', true, true, NOW(), NOW()
FROM (VALUES
  ('nrule_default_consultant_invoice_request', 'CONSULTANT_INVOICE_REQUEST'),
  ('nrule_default_payment_released_by_people', 'PAYMENT_RELEASED_BY_PEOPLE'),
  ('nrule_default_sla_deadline_approaching', 'SLA_DEADLINE_APPROACHING'),
  ('nrule_default_sla_overdue', 'SLA_OVERDUE')
) AS v("id", "event")
WHERE NOT EXISTS (
  SELECT 1 FROM "NotificationRule" r WHERE r."event" = v."event"::"NotificationEvent"
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "NotificationRecipient" ("id", "ruleId", "type", "channel", "address", "name", "createdAt")
SELECT v."id", v."ruleId", v."type"::"NotificationRecipientType", 'EMAIL', v."address", v."name", NOW()
FROM (VALUES
  ('nrcpt_default_consultant_invoice_request_target', 'nrule_default_consultant_invoice_request', 'EVENT_TARGET', NULL, 'Consultor'),
  ('nrcpt_default_payment_released_by_people_finance', 'nrule_default_payment_released_by_people', 'ROLE', 'FINANCE', 'Financeiro'),
  ('nrcpt_default_sla_deadline_approaching_area_manager', 'nrule_default_sla_deadline_approaching', 'ROLE', 'AREA_MANAGER', 'Gestores de área'),
  ('nrcpt_default_sla_deadline_approaching_people', 'nrule_default_sla_deadline_approaching', 'ROLE', 'PEOPLE', 'DP / People'),
  ('nrcpt_default_sla_deadline_approaching_finance', 'nrule_default_sla_deadline_approaching', 'ROLE', 'FINANCE', 'Financeiro'),
  ('nrcpt_default_sla_overdue_area_manager', 'nrule_default_sla_overdue', 'ROLE', 'AREA_MANAGER', 'Gestores de área'),
  ('nrcpt_default_sla_overdue_people', 'nrule_default_sla_overdue', 'ROLE', 'PEOPLE', 'DP / People'),
  ('nrcpt_default_sla_overdue_finance', 'nrule_default_sla_overdue', 'ROLE', 'FINANCE', 'Financeiro')
) AS v("id", "ruleId", "type", "address", "name")
WHERE EXISTS (SELECT 1 FROM "NotificationRule" r WHERE r."id" = v."ruleId")
ON CONFLICT ("id") DO NOTHING;

-- OPERATION_CLOSED: o Financeiro também recebe o aviso de fechamento
-- operacional. Acrescenta ROLE FINANCE às regras EMAIL globais que já mandam
-- para ROLE PEOPLE (a regra padrão) e ainda não têm FINANCE. Não cria regra se
-- o evento não tem nenhuma (o ADMIN pode tê-la removido de propósito).
INSERT INTO "NotificationRecipient" ("id", "ruleId", "type", "channel", "address", "name", "createdAt")
SELECT 'nrcpt_' || r."id" || '_finance', r."id", 'ROLE', 'EMAIL', 'FINANCE', 'Financeiro', NOW()
FROM "NotificationRule" r
WHERE r."event" = 'OPERATION_CLOSED'
  AND r."scope" = 'GLOBAL'
  AND r."channel" = 'EMAIL'
  AND EXISTS (
    SELECT 1 FROM "NotificationRecipient" p
    WHERE p."ruleId" = r."id" AND p."type" = 'ROLE' AND p."address" = 'PEOPLE'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "NotificationRecipient" f
    WHERE f."ruleId" = r."id" AND f."type" = 'ROLE' AND f."address" = 'FINANCE'
  )
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Matriz de Permissões (espelha PERMISSION_CATALOG no seed.mjs e
--    align-permission-catalog.mjs). Telas pai já existem: FINANCEIRO,
--    PAGAMENTOS (Financeiro) e as novas raízes abaixo.
-- ---------------------------------------------------------------------------
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
VALUES ('perm_sla_acompanhamento', 'SLA_ACOMPANHAMENTO', 'Acompanhamento de SLA', 'Operação', 27, true, NULL, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
VALUES ('perm_configuracoes_templates_email', 'CONFIGURACOES_TEMPLATES_EMAIL', 'Templates de e-mail', 'Administração', 126, true, NULL, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
SELECT 'perm_faturamento_reabrir_liberacao', 'FATURAMENTO_REABRIR_LIBERACAO', 'Reabrir faturamento liberado', 'Financeiro', 113, true, p."id", NOW(), NOW()
FROM "Permission" p WHERE p."code" = 'FINANCEIRO'
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
SELECT 'perm_pagamentos_liberacao_dp', 'PAGAMENTOS_LIBERACAO_DP', 'Liberar pagamento (DP)', 'Financeiro', 114, true, p."id", NOW(), NOW()
FROM "Permission" p WHERE p."code" = 'PAGAMENTOS'
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
SELECT 'perm_pagamentos_envio_nf', 'PAGAMENTOS_ENVIO_NF', 'Enviar solicitação de NF', 'Financeiro', 115, true, p."id", NOW(), NOW()
FROM "Permission" p WHERE p."code" = 'PAGAMENTOS'
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
SELECT 'perm_pagamentos_reabrir_liberacao', 'PAGAMENTOS_REABRIR_LIBERACAO', 'Reabrir liberação de pagamento', 'Financeiro', 116, true, p."id", NOW(), NOW()
FROM "Permission" p WHERE p."code" = 'PAGAMENTOS'
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
SELECT 'perm_sla_configuracao', 'SLA_CONFIGURACAO', 'Configurar prazos de SLA', 'Operação', 28, true, p."id", NOW(), NOW()
FROM "Permission" p WHERE p."code" = 'SLA_ACOMPANHAMENTO'
ON CONFLICT ("code") DO NOTHING;

-- Grants dos papéis de sistema para os codes NOVOS. ON CONFLICT DO NOTHING:
-- rodar de novo nunca desfaz ajustes do ADMIN. Por decisão de negócio, as
-- reaberturas (FATURAMENTO_REABRIR_LIBERACAO, PAGAMENTOS_REABRIR_LIBERACAO)
-- NÃO são concedidas ao ADMIN — só ao FINANCE; o ADMIN pode se conceder pela
-- Matriz se precisar.
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", p."id", g."canView", false, g."canEdit", false, NOW()
FROM (VALUES
  ('FATURAMENTO_REABRIR_LIBERACAO', 'FINANCE', true, true),
  ('PAGAMENTOS_LIBERACAO_DP', 'ADMIN', true, true),
  ('PAGAMENTOS_LIBERACAO_DP', 'PEOPLE', true, true),
  ('PAGAMENTOS_LIBERACAO_DP', 'FINANCE', true, false),
  ('PAGAMENTOS_ENVIO_NF', 'ADMIN', true, true),
  ('PAGAMENTOS_ENVIO_NF', 'FINANCE', true, true),
  ('PAGAMENTOS_REABRIR_LIBERACAO', 'FINANCE', true, true),
  ('CONFIGURACOES_TEMPLATES_EMAIL', 'ADMIN', true, true),
  ('SLA_ACOMPANHAMENTO', 'ADMIN', true, false),
  ('SLA_ACOMPANHAMENTO', 'AREA_MANAGER', true, false),
  ('SLA_ACOMPANHAMENTO', 'PROJECT_MANAGER', true, false),
  ('SLA_ACOMPANHAMENTO', 'FINANCE', true, false),
  ('SLA_ACOMPANHAMENTO', 'PEOPLE', true, false),
  ('SLA_CONFIGURACAO', 'ADMIN', true, true),
  ('SLA_CONFIGURACAO', 'FINANCE', true, true)
) AS g("code", "roleKey", "canView", "canEdit")
JOIN "Permission" p ON p."code" = g."code"
JOIN "Role" r ON r."key" = g."roleKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- DP/People passa a abrir /app/pagamentos (para liberar pagamentos): garante
-- VIEW em PAGAMENTOS, sem tocar nas demais ações da célula.
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", p."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."key" = 'PEOPLE' AND p."code" = 'PAGAMENTOS'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "canView" = true, "updatedAt" = NOW();
