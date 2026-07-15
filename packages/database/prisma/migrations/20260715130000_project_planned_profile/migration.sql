-- Linha orcada / perfil planejado do projeto SEM pessoa (ingestao CRM-Jumplabel,
-- G1 Opcao A). Aditivo e seguro: nova tabela, sem alteracao em dados existentes.
-- Valores sao de VENDA (saleUnitValue/saleLineValue), NUNCA custo (fronteira D9).
-- FK onDelete Cascade: as linhas somem junto com o projeto de origem.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateTable
CREATE TABLE "ProjectPlannedProfile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "crmLineId" TEXT,
    "roleName" TEXT NOT NULL,
    "seniority" "Seniority" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "budgetHours" DECIMAL(10,2) NOT NULL,
    "saleUnitValue" DECIMAL(12,2) NOT NULL,
    "saleLineValue" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectPlannedProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectPlannedProfile_projectId_idx" ON "ProjectPlannedProfile"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectPlannedProfile" ADD CONSTRAINT "ProjectPlannedProfile_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
