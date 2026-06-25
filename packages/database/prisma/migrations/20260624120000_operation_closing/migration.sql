-- Fechamento Operacional para o DP (eixo paralelo ao financeiro/RevenueClosing).
-- Aditivo e seguro: novo enum/tabela; estende NotificationEvent com um valor
-- nao usado nesta migration (sem conflito transacional).
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- AlterEnum: evento de notificacao do fechamento operacional ao DP.
ALTER TYPE "NotificationEvent" ADD VALUE 'OPERATION_CLOSED';

-- CreateEnum
CREATE TYPE "OperationClosingStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "OperationClosing" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "OperationClosingStatus" NOT NULL DEFAULT 'OPEN',
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedByUserId" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "consultantsSnapshot" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperationClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OperationClosing_projectId_month_year_key" ON "OperationClosing"("projectId", "month", "year");

-- CreateIndex
CREATE INDEX "OperationClosing_status_year_month_idx" ON "OperationClosing"("status", "year", "month");

-- AddForeignKey
ALTER TABLE "OperationClosing" ADD CONSTRAINT "OperationClosing_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
