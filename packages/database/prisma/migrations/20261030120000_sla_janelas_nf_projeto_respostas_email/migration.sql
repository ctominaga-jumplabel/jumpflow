-- SLA: janelas de envio da NF + SLA por projeto (Faturamento) + respostas a
-- e-mails enviados (Resend Inbound) e NF anexada por e-mail.
--
-- 1. SlaInvoiceTier: janelas ADICIONAIS de envio da NF (a janela 1 continua
--    sendo SlaStage INVOICE_RECEIPT + SlaSettings.paymentDay). Sem linhas
--    semeadas: sem janela extra o comportamento é o atual.
-- 2. SlaProjectRule: prazo por projeto × etapa do processo Horas → Faturamento,
--    em dias úteis ou travado num dia do mês.
-- 3. EmailReplyRoute (destino das respostas por evento), OutboundEmailThread
--    (token do Reply-To) e InboundEmail (respostas recebidas).
-- 4. ConsultantInvoiceAttachment.source/inboundEmailId: NF recebida por e-mail.
-- 5. Matriz de Permissões: SLA_PROJETOS, PAGAMENTOS_RESPOSTAS_EMAIL,
--    CONFIGURACOES_RESPOSTAS_EMAIL + grants dos papéis de sistema.
--
-- Aditivo: nada é removido. INSERTs usam ON CONFLICT DO NOTHING (células da
-- matriz já existentes não são sobrescritas).

-- CreateEnum
CREATE TYPE "InvoiceAttachmentSource" AS ENUM ('UPLOAD', 'EMAIL');

-- CreateEnum
CREATE TYPE "SlaDateRuleKind" AS ENUM ('BUSINESS_DAY', 'FIXED_DAY');

-- CreateEnum
CREATE TYPE "SlaProjectRuleMode" AS ENUM ('BUSINESS_DAYS', 'FIXED_DAY');

-- CreateEnum
CREATE TYPE "InboundForwardStatus" AS ENUM ('PENDING', 'FORWARDED', 'NO_RECIPIENTS', 'FAILED');

-- AlterTable
ALTER TABLE "ConsultantInvoiceAttachment" ADD COLUMN     "inboundEmailId" TEXT,
ADD COLUMN     "source" "InvoiceAttachmentSource" NOT NULL DEFAULT 'UPLOAD';

-- CreateTable
CREATE TABLE "SlaInvoiceTier" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "receiptKind" "SlaDateRuleKind" NOT NULL,
    "receiptValue" INTEGER NOT NULL,
    "receiptMonthOffset" INTEGER NOT NULL DEFAULT 1,
    "paymentKind" "SlaDateRuleKind" NOT NULL,
    "paymentValue" INTEGER NOT NULL,
    "paymentMonthOffset" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaInvoiceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlaProjectRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "stageKey" "SlaStageKey" NOT NULL,
    "mode" "SlaProjectRuleMode" NOT NULL,
    "businessDays" INTEGER,
    "fixedDay" INTEGER,
    "monthOffset" INTEGER NOT NULL DEFAULT 1,
    "warningBusinessDays" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlaProjectRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailReplyRoute" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "recipients" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailReplyRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutboundEmailThread" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "subject" TEXT,
    "sentTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboundEmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InboundEmail" (
    "id" TEXT NOT NULL,
    "resendEmailId" TEXT NOT NULL,
    "threadId" TEXT,
    "event" "NotificationEvent",
    "referenceType" TEXT,
    "referenceId" TEXT,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "subject" TEXT,
    "textBody" TEXT,
    "htmlBody" TEXT,
    "attachmentsMeta" JSONB,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "forwardStatus" "InboundForwardStatus" NOT NULL DEFAULT 'PENDING',
    "forwardedTo" TEXT[],
    "forwardError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlaInvoiceTier_active_sortOrder_idx" ON "SlaInvoiceTier"("active", "sortOrder");

-- CreateIndex
CREATE INDEX "SlaProjectRule_active_idx" ON "SlaProjectRule"("active");

-- CreateIndex
CREATE UNIQUE INDEX "SlaProjectRule_projectId_stageKey_key" ON "SlaProjectRule"("projectId", "stageKey");

-- CreateIndex
CREATE UNIQUE INDEX "EmailReplyRoute_event_key" ON "EmailReplyRoute"("event");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundEmailThread_token_key" ON "OutboundEmailThread"("token");

-- CreateIndex
CREATE INDEX "OutboundEmailThread_referenceType_referenceId_idx" ON "OutboundEmailThread"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "InboundEmail_resendEmailId_key" ON "InboundEmail"("resendEmailId");

-- CreateIndex
CREATE INDEX "InboundEmail_referenceType_referenceId_idx" ON "InboundEmail"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "InboundEmail_threadId_idx" ON "InboundEmail"("threadId");

-- CreateIndex
CREATE INDEX "ConsultantInvoiceAttachment_inboundEmailId_idx" ON "ConsultantInvoiceAttachment"("inboundEmailId");

-- AddForeignKey
ALTER TABLE "ConsultantInvoiceAttachment" ADD CONSTRAINT "ConsultantInvoiceAttachment_inboundEmailId_fkey" FOREIGN KEY ("inboundEmailId") REFERENCES "InboundEmail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlaProjectRule" ADD CONSTRAINT "SlaProjectRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundEmail" ADD CONSTRAINT "InboundEmail_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "OutboundEmailThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- 5. Matriz de Permissões (espelha PERMISSION_CATALOG no seed.mjs e
--    align-permission-catalog.mjs).
-- ---------------------------------------------------------------------------
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
SELECT 'perm_sla_projetos', 'SLA_PROJETOS', 'SLA por projeto (faturamento)', 'Operação', 29, true, p."id", NOW(), NOW()
FROM "Permission" p WHERE p."code" = 'SLA_ACOMPANHAMENTO'
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
SELECT 'perm_pagamentos_respostas_email', 'PAGAMENTOS_RESPOSTAS_EMAIL', 'Respostas por e-mail da NF', 'Financeiro', 117, true, p."id", NOW(), NOW()
FROM "Permission" p WHERE p."code" = 'PAGAMENTOS'
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "parentId", "createdAt", "updatedAt")
SELECT 'perm_configuracoes_respostas_email', 'CONFIGURACOES_RESPOSTAS_EMAIL', 'Destino das respostas de e-mail', 'Administração', 127, true, p."id", NOW(), NOW()
FROM "Permission" p WHERE p."code" = 'CONFIGURACOES_TEMPLATES_EMAIL'
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", p."id", g."canView", g."canCreate", g."canEdit", g."canDelete", NOW()
FROM (VALUES
  ('SLA_PROJETOS', 'ADMIN', true, true, true, true),
  ('SLA_PROJETOS', 'FINANCE', true, true, true, true),
  ('SLA_PROJETOS', 'AREA_MANAGER', true, false, false, false),
  ('PAGAMENTOS_RESPOSTAS_EMAIL', 'ADMIN', true, false, false, false),
  ('PAGAMENTOS_RESPOSTAS_EMAIL', 'FINANCE', true, false, false, false),
  ('CONFIGURACOES_RESPOSTAS_EMAIL', 'ADMIN', true, false, true, false)
) AS g("code", "roleKey", "canView", "canCreate", "canEdit", "canDelete")
JOIN "Permission" p ON p."code" = g."code"
JOIN "Role" r ON r."key" = g."roleKey"
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
