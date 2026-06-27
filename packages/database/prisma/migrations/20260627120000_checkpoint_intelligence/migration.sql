-- Checkpoint / 1-on-1 + entidades de inteligencia (Melhoria #4, fatia 1).
-- Aditivo e seguro: novos enums e tabelas, sem tocar em estrutura existente.
--
-- Decisoes de produto ja aprovadas:
--   * So o GESTOR registra (regra de app); 1-on-1 PRIVATE por padrao (consultor
--     nao ve) — visibility default PRIVATE.
--   * Oportunidade = chance FUTURA a agir; Case = entrega CONCLUIDA digna de
--     referencia. Ambos INTERNOS + handoff manual (sem CRM).
--   * Skills NAO ganham modelo proprio: a IA mapeia para SkillSuggestion com
--     sourceEntryIds = ["checkpoint:<id>"] na fatia de IA.
--   * REUSA o enum TranscriptionStatus existente para o audio (nao recria).
--
-- IMPORTANTE: o motor de migrate do Prisma TRAVA no pooler do Supabase, entao
-- esta migration e aplicada via PrismaClient.$executeRawUnsafe pelo script
-- packages/database/scripts/migrate-checkpoint-intelligence.mjs (dry-run por
-- padrao, --apply para executar, registro manual em _prisma_migrations com
-- sha256). Este migration.sql e a fonte canonica (e o que o sha256 verifica).

-- CreateEnum
CREATE TYPE "CheckpointType" AS ENUM ('ONE_ON_ONE', 'CHECKPOINT');

-- CreateEnum
CREATE TYPE "CheckpointStatus" AS ENUM ('DRAFT', 'RECORDED', 'EXTRACTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CheckpointVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "CheckpointExtractionStatus" AS ENUM ('NONE', 'PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "CheckpointInsightStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OpportunityKind" AS ENUM ('EXPANSION', 'UPSELL', 'RISK', 'REFERRAL', 'RENEWAL');

-- CreateEnum
CREATE TYPE "OpportunityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "CaseStage" AS ENUM ('DRAFT_INSIGHT', 'APPROVED', 'PUBLISHABLE');

-- CreateTable
CREATE TABLE "Checkpoint" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "managerUserId" TEXT,
    "relatedProjectId" TEXT,
    "type" "CheckpointType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "weekStart" TIMESTAMP(3),
    "weekEnd" TIMESTAMP(3),
    "title" TEXT,
    "notes" TEXT,
    "audioStorageKey" TEXT,
    "transcription" TEXT,
    "transcriptionStatus" "TranscriptionStatus" NOT NULL DEFAULT 'NONE',
    "extractionStatus" "CheckpointExtractionStatus" NOT NULL DEFAULT 'NONE',
    "extractedAt" TIMESTAMP(3),
    "status" "CheckpointStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "CheckpointVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "sourceCheckpointId" TEXT,
    "consultantId" TEXT,
    "relatedClientId" TEXT,
    "relatedProjectId" TEXT,
    "kind" "OpportunityKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "OpportunityPriority" NOT NULL DEFAULT 'MEDIUM',
    "sourceQuote" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "status" "CheckpointInsightStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" TEXT NOT NULL,
    "sourceCheckpointId" TEXT,
    "consultantId" TEXT,
    "relatedClientId" TEXT,
    "relatedProjectId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "outcome" TEXT,
    "stage" "CaseStage" NOT NULL DEFAULT 'DRAFT_INSIGHT',
    "clientConsentState" TEXT,
    "sourceQuote" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "status" "CheckpointInsightStatus" NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Checkpoint_consultantId_idx" ON "Checkpoint"("consultantId");

-- CreateIndex
CREATE INDEX "Checkpoint_consultantId_occurredAt_idx" ON "Checkpoint"("consultantId", "occurredAt");

-- CreateIndex
CREATE INDEX "Checkpoint_managerUserId_idx" ON "Checkpoint"("managerUserId");

-- CreateIndex
CREATE INDEX "Checkpoint_status_idx" ON "Checkpoint"("status");

-- CreateIndex
CREATE INDEX "Checkpoint_extractionStatus_idx" ON "Checkpoint"("extractionStatus");

-- CreateIndex
CREATE INDEX "Opportunity_sourceCheckpointId_idx" ON "Opportunity"("sourceCheckpointId");

-- CreateIndex
CREATE INDEX "Opportunity_relatedClientId_idx" ON "Opportunity"("relatedClientId");

-- CreateIndex
CREATE INDEX "Opportunity_status_idx" ON "Opportunity"("status");

-- CreateIndex
CREATE INDEX "Case_sourceCheckpointId_idx" ON "Case"("sourceCheckpointId");

-- CreateIndex
CREATE INDEX "Case_relatedClientId_idx" ON "Case"("relatedClientId");

-- CreateIndex
CREATE INDEX "Case_status_idx" ON "Case"("status");

-- CreateIndex
CREATE INDEX "Case_stage_idx" ON "Case"("stage");

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_managerUserId_fkey" FOREIGN KEY ("managerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkpoint" ADD CONSTRAINT "Checkpoint_relatedProjectId_fkey" FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sourceCheckpointId_fkey" FOREIGN KEY ("sourceCheckpointId") REFERENCES "Checkpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_relatedClientId_fkey" FOREIGN KEY ("relatedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_relatedProjectId_fkey" FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_sourceCheckpointId_fkey" FOREIGN KEY ("sourceCheckpointId") REFERENCES "Checkpoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_relatedClientId_fkey" FOREIGN KEY ("relatedClientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_relatedProjectId_fkey" FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
