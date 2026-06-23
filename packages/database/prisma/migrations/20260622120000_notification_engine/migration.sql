-- Motor de notificacoes (Onda 1 do plano de melhorias).
-- Aditivo e seguro: novos enums/tabelas; estende dois enums existentes com
-- valores nao usados nesta migration (sem conflito transacional).
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- AlterEnum: novo canal de webhook de saida (Teams).
ALTER TYPE "IntegrationProviderKind" ADD VALUE 'TEAMS';

-- AlterEnum: tipo generico de e-mail do motor de notificacoes.
ALTER TYPE "AutomationEmailType" ADD VALUE 'NOTIFICATION';

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TEAMS');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('HOURS_RELEASED', 'CLIENT_BILLING_SUMMARY', 'OVERTIME_ALERT', 'PROJECT_CREATED', 'INVOICING_OVERDUE', 'COMMERCIAL_CONTRACT_MISSING');

-- CreateEnum
CREATE TYPE "NotificationScope" AS ENUM ('GLOBAL', 'PROJECT', 'ALLOCATION');

-- CreateEnum
CREATE TYPE "NotificationRecipientType" AS ENUM ('STATIC', 'ROLE', 'PROJECT_MANAGER', 'CLIENT_CONTACT');

-- CreateTable
CREATE TABLE "NotificationRule" (
    "id" TEXT NOT NULL,
    "event" "NotificationEvent" NOT NULL,
    "scope" "NotificationScope" NOT NULL DEFAULT 'GLOBAL',
    "scopeId" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "groupByRecipient" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "type" "NotificationRecipientType" NOT NULL DEFAULT 'STATIC',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "address" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationRule_event_active_idx" ON "NotificationRule"("event", "active");

-- CreateIndex
CREATE INDEX "NotificationRule_scope_scopeId_idx" ON "NotificationRule"("scope", "scopeId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_ruleId_idx" ON "NotificationRecipient"("ruleId");

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "NotificationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
