-- COE (Centro Operacional de Excelencia): curadoria do nucleo de consultores
-- estrategicos + propostas de time para paralelizar frentes de um projeto.
--
-- Aditivo e seguro: tres tabelas NOVAS e um enum NOVO. Nenhuma tabela existente
-- e alterada e nenhuma linha e afetada. Nao ha seed de dados: o nucleo nasce
-- vazio e e curado pela tela /app/coe.
--
-- Fronteira financeira: nenhuma coluna aqui guarda custo, valor de venda ou
-- margem. `CoeSquadMember.slotScore` e o score composto 0..100.
--
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateEnum
CREATE TYPE "CoeSquadStatus" AS ENUM ('DRAFT', 'PROPOSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "CoeMember" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "focusArea" TEXT NOT NULL,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoeSquad" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CoeSquadStatus" NOT NULL DEFAULT 'DRAFT',
    "periodStart" DATE,
    "weeks" INTEGER NOT NULL DEFAULT 4,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoeSquad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoeSquadMember" (
    "id" TEXT NOT NULL,
    "squadId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "slotKey" TEXT NOT NULL,
    "slotLabel" TEXT NOT NULL,
    "slotScore" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoeSquadMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoeMember_consultantId_key" ON "CoeMember"("consultantId");

-- CreateIndex
CREATE INDEX "CoeMember_active_idx" ON "CoeMember"("active");

-- CreateIndex
CREATE INDEX "CoeMember_addedById_idx" ON "CoeMember"("addedById");

-- CreateIndex
CREATE INDEX "CoeSquad_projectId_createdAt_idx" ON "CoeSquad"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "CoeSquad_createdById_idx" ON "CoeSquad"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CoeSquadMember_squadId_slotKey_key" ON "CoeSquadMember"("squadId", "slotKey");

-- CreateIndex
CREATE INDEX "CoeSquadMember_squadId_idx" ON "CoeSquadMember"("squadId");

-- CreateIndex
CREATE INDEX "CoeSquadMember_consultantId_idx" ON "CoeSquadMember"("consultantId");

-- AddForeignKey
ALTER TABLE "CoeMember" ADD CONSTRAINT "CoeMember_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoeMember" ADD CONSTRAINT "CoeMember_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoeSquad" ADD CONSTRAINT "CoeSquad_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoeSquad" ADD CONSTRAINT "CoeSquad_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoeSquadMember" ADD CONSTRAINT "CoeSquadMember_squadId_fkey" FOREIGN KEY ("squadId") REFERENCES "CoeSquad"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoeSquadMember" ADD CONSTRAINT "CoeSquadMember_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
