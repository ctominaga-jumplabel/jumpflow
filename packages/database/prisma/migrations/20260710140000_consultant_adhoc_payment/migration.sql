-- Onda D (Frente 1). Remuneracao pontual do consultor, decisao D2: SEMPRE
-- vinculada a um projeto (projectId obrigatorio), pois entra no custo/margem
-- daquele projeto. Vinculo opcional a uma alocacao.
-- Mudanca 100% aditiva: nenhuma coluna/tabela existente e alterada ou perdida.
-- FKs:
--   consultantId -> Consultant ON DELETE CASCADE (segue o ciclo do consultor)
--   projectId    -> Project    ON DELETE RESTRICT (preserva historico financeiro;
--                                nao apaga projeto com pontual atrelada)
--   allocationId -> Allocation ON DELETE SET NULL (vinculo opcional; registro
--                                sobrevive a remocao da alocacao)
-- Dado financeiro: leitura/escrita restrita por RBAC e alteracoes (valor, status)
-- devem gerar AuditEvent na aplicacao.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateEnum
CREATE TYPE "AdHocPaymentKind" AS ENUM ('BONUS', 'ADJUSTMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "AdHocPaymentStatus" AS ENUM ('PLANNED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "ConsultantAdHocPayment" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "allocationId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "payAt" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "kind" "AdHocPaymentKind" NOT NULL DEFAULT 'OTHER',
    "status" "AdHocPaymentStatus" NOT NULL DEFAULT 'PLANNED',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantAdHocPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantAdHocPayment_consultantId_idx" ON "ConsultantAdHocPayment"("consultantId");

-- CreateIndex
CREATE INDEX "ConsultantAdHocPayment_projectId_idx" ON "ConsultantAdHocPayment"("projectId");

-- CreateIndex
CREATE INDEX "ConsultantAdHocPayment_payAt_idx" ON "ConsultantAdHocPayment"("payAt");

-- AddForeignKey
ALTER TABLE "ConsultantAdHocPayment" ADD CONSTRAINT "ConsultantAdHocPayment_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAdHocPayment" ADD CONSTRAINT "ConsultantAdHocPayment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAdHocPayment" ADD CONSTRAINT "ConsultantAdHocPayment_allocationId_fkey" FOREIGN KEY ("allocationId") REFERENCES "Allocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
