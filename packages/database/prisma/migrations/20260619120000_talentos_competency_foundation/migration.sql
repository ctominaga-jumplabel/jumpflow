-- Onda 0 (Desenvolvimento & Talentos): fundacao da Matriz de Competencias.
-- Migracao puramente aditiva. Cobre:
--   1. Skill.type (enum SkillType) com DEFAULT 'TECHNICAL' (backfill seguro das
--      linhas existentes; coluna NOT NULL gracas ao default).
--   2. CompetencyProfile / CompetencyProfileItem (nivel requerido por
--      senioridade/cargo/area -> base do gap analysis).
--   3. SkillEvidence (evidencias que sustentam o nivel atual da competencia).
--   4. ConsultantSkillHistory (historico append-only de evolucao de nivel).
--
-- Nenhuma coluna existente e alterada de forma destrutiva e nenhuma tabela e
-- removida, logo a migracao e segura para os dados atuais. Todas as novas
-- tabelas comecam vazias. O DDL espelha exatamente a saida gerada pelo Prisma.
--
-- Este arquivo foi escrito manualmente porque `prisma migrate dev` neste
-- ambiente apontaria para o banco de producao (Supabase) e a rede e restrita.
-- Aplicar com `npm run db:deploy` (prisma migrate deploy) a partir de um
-- ambiente com acesso ao banco, ANTES do merge na main.

-- CreateEnum
CREATE TYPE "SkillType" AS ENUM ('TECHNICAL', 'BEHAVIORAL');

-- CreateEnum
CREATE TYPE "CompetencyScope" AS ENUM ('SENIORITY', 'ROLE', 'AREA');

-- CreateEnum
CREATE TYPE "SkillEvidenceSource" AS ENUM ('FEEDBACK', 'EVALUATION', 'CERTIFICATE', 'PROJECT', 'MANUAL');

-- AlterTable
-- DEFAULT 'TECHNICAL' garante que toda linha existente de Skill recebe o valor
-- no momento do ADD COLUMN, mantendo a coluna NOT NULL sem etapa de backfill.
ALTER TABLE "Skill" ADD COLUMN "type" "SkillType" NOT NULL DEFAULT 'TECHNICAL';

-- CreateTable
CREATE TABLE "CompetencyProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "CompetencyScope" NOT NULL,
    "referenceKey" TEXT NOT NULL,
    "status" "SkillStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetencyProfileItem" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "requiredLevel" "SkillLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetencyProfileItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillEvidence" (
    "id" TEXT NOT NULL,
    "consultantSkillId" TEXT NOT NULL,
    "sourceType" "SkillEvidenceSource" NOT NULL,
    "sourceId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantSkillHistory" (
    "id" TEXT NOT NULL,
    "consultantSkillId" TEXT NOT NULL,
    "level" "SkillLevel" NOT NULL,
    "changedByUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultantSkillHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompetencyProfile_status_idx" ON "CompetencyProfile"("status");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyProfile_scope_referenceKey_key" ON "CompetencyProfile"("scope", "referenceKey");

-- CreateIndex
CREATE INDEX "CompetencyProfileItem_profileId_idx" ON "CompetencyProfileItem"("profileId");

-- CreateIndex
CREATE INDEX "CompetencyProfileItem_skillId_idx" ON "CompetencyProfileItem"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetencyProfileItem_profileId_skillId_key" ON "CompetencyProfileItem"("profileId", "skillId");

-- CreateIndex
CREATE INDEX "SkillEvidence_consultantSkillId_idx" ON "SkillEvidence"("consultantSkillId");

-- CreateIndex
CREATE INDEX "ConsultantSkillHistory_consultantSkillId_idx" ON "ConsultantSkillHistory"("consultantSkillId");

-- AddForeignKey
ALTER TABLE "CompetencyProfileItem"
ADD CONSTRAINT "CompetencyProfileItem_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "CompetencyProfile"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetencyProfileItem"
ADD CONSTRAINT "CompetencyProfileItem_skillId_fkey"
FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEvidence"
ADD CONSTRAINT "SkillEvidence_consultantSkillId_fkey"
FOREIGN KEY ("consultantSkillId") REFERENCES "ConsultantSkill"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantSkillHistory"
ADD CONSTRAINT "ConsultantSkillHistory_consultantSkillId_fkey"
FOREIGN KEY ("consultantSkillId") REFERENCES "ConsultantSkill"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantSkillHistory"
ADD CONSTRAINT "ConsultantSkillHistory_changedByUserId_fkey"
FOREIGN KEY ("changedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
