-- Onda C (financeiro do projeto). Tres mudancas aditivas no dominio de Projeto:
--   1. ProjectReceivableSchedule: agenda de recebimentos previstos do cliente
--      (lado receita) - parcelas com data, valor, label e situacao. Complementa
--      BillingType/ProjectBillingConfig (como se COBRA) com QUANDO/QUANTO entra.
--   2. Project.paymentType: condicao/arranjo de pagamento do cliente (prazo).
--      NAO substitui BillingChargeType (modelo de cobranca); e aditivo/opcional.
--   3. Project: flag INFORMATIVA de termo de aceite (nao bloqueia nada).
-- Nenhuma coluna existente e removida e nenhum dado e perdido. Todos os novos
-- campos de Project sao opcionais ou com DEFAULT, seguro para linhas existentes.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateEnum
CREATE TYPE "ProjectPaymentType" AS ENUM ('ONE_TIME', 'INSTALLMENTS', 'MONTHLY', 'ON_MILESTONE');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('FORECAST', 'RECEIVED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "paymentType" "ProjectPaymentType",
ADD COLUMN     "requiresAcceptanceTerm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acceptanceTermAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "acceptanceTermAcceptedByUserId" TEXT;

-- CreateTable
CREATE TABLE "ProjectReceivableSchedule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dueAt" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "label" TEXT NOT NULL,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'FORECAST',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectReceivableSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectReceivableSchedule_projectId_dueAt_idx" ON "ProjectReceivableSchedule"("projectId", "dueAt");

-- AddForeignKey
ALTER TABLE "ProjectReceivableSchedule" ADD CONSTRAINT "ProjectReceivableSchedule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
