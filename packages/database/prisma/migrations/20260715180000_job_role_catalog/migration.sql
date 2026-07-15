-- Catalogo de cargos (JobRole) = de/para de cargo por slug, espelhando o catalogo
-- dinamico do CRM-Jumplabel. NAO ha lista fixa semeada; o JumpFlow preenche
-- on-demand pela ingestao. ProjectPlannedProfile ganha FK opcional jobRoleId
-- (onDelete SetNull: remover um cargo do catalogo nao apaga a linha orcada; o
-- roleName textual permanece como exibicao/fallback).
-- Aditivo e seguro: nova tabela + nova coluna nullable. Nenhuma linha afetada.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateTable
CREATE TABLE "JobRole" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobRole_name_key" ON "JobRole"("name");

-- CreateIndex
CREATE UNIQUE INDEX "JobRole_slug_key" ON "JobRole"("slug");

-- AlterTable
ALTER TABLE "ProjectPlannedProfile" ADD COLUMN "jobRoleId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectPlannedProfile_jobRoleId_idx" ON "ProjectPlannedProfile"("jobRoleId");

-- AddForeignKey
ALTER TABLE "ProjectPlannedProfile" ADD CONSTRAINT "ProjectPlannedProfile_jobRoleId_fkey" FOREIGN KEY ("jobRoleId") REFERENCES "JobRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
