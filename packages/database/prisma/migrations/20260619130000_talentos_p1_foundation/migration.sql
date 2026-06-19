-- Prioridade 1 (Desenvolvimento & Talentos): nucleo de talentos. Cobre:
--   1. Feedback continuo (EP15) incl. campos de voz/IA atras de flag.
--   2. Avaliacao 90/180/360 (EP16): EvaluationCycle / Evaluation /
--      EvaluationResponse / EvaluationAnswer.
--   3. PDI (EP17): DevelopmentPlan / DevelopmentAction.
--   4. ConsultantTimeOff: ausencia agendada com datas concretas de gozo, fonte
--      real do heatmap de disponibilidade (EP11), complementar ao ledger
--      ConsultantVacation (que NAO e alterado).
--
-- Migracao puramente aditiva: nenhuma coluna existente e alterada de forma
-- destrutiva e nenhuma tabela e removida. Todas as novas tabelas comecam vazias.
-- O DDL espelha exatamente a saida gerada pelo Prisma.
--
-- Escrito manualmente porque `prisma migrate dev` neste ambiente apontaria para
-- o banco de producao (Supabase) e a rede e restrita. Aplicar com
-- `npm run db:deploy` (prisma migrate deploy) a partir de um ambiente com acesso
-- ao banco, ANTES do merge na main.

-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('PRAISE', 'GUIDANCE', 'RECOGNITION', 'CONCERN');

-- CreateEnum
CREATE TYPE "FeedbackSource" AS ENUM ('INTERNAL', 'CLIENT', 'PEER');

-- CreateEnum
CREATE TYPE "FeedbackVisibility" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "TranscriptionStatus" AS ENUM ('NONE', 'PENDING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "EvaluationType" AS ENUM ('SELF_90', 'MANAGER_180', 'FULL_360');

-- CreateEnum
CREATE TYPE "EvaluationCycleStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EvaluationStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "EvaluationRelationship" AS ENUM ('SELF', 'MANAGER', 'PEER', 'CLIENT', 'SUBORDINATE');

-- CreateEnum
CREATE TYPE "DevelopmentPlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DevelopmentActionType" AS ENUM ('TRAINING', 'MENTORSHIP', 'CERTIFICATION', 'PROJECT', 'READING');

-- CreateEnum
CREATE TYPE "DevelopmentActionStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimeOffKind" AS ENUM ('VACATION', 'LEAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('PLANNED', 'CONFIRMED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "subjectConsultantId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "type" "FeedbackType" NOT NULL,
    "source" "FeedbackSource" NOT NULL,
    "visibility" "FeedbackVisibility" NOT NULL DEFAULT 'PRIVATE',
    "body" TEXT NOT NULL,
    "relatedProjectId" TEXT,
    "relatedClientId" TEXT,
    "audioStorageKey" TEXT,
    "transcription" TEXT,
    "transcriptionStatus" "TranscriptionStatus" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EvaluationType" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "EvaluationCycleStatus" NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "subjectConsultantId" TEXT NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationResponse" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "raterUserId" TEXT,
    "relationship" "EvaluationRelationship" NOT NULL,
    "status" "EvaluationStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentPlan" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "cycleId" TEXT,
    "ownerUserId" TEXT,
    "status" "DevelopmentPlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevelopmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevelopmentAction" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "type" "DevelopmentActionType" NOT NULL,
    "targetSkillId" TEXT,
    "description" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "DevelopmentActionStatus" NOT NULL DEFAULT 'PLANNED',
    "evidenceNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DevelopmentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantTimeOff" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "kind" "TimeOffKind" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantTimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_subjectConsultantId_idx" ON "Feedback"("subjectConsultantId");

-- CreateIndex
CREATE INDEX "Feedback_subjectConsultantId_createdAt_idx" ON "Feedback"("subjectConsultantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_cycleId_subjectConsultantId_key" ON "Evaluation"("cycleId", "subjectConsultantId");

-- CreateIndex
CREATE INDEX "EvaluationResponse_evaluationId_idx" ON "EvaluationResponse"("evaluationId");

-- CreateIndex
CREATE INDEX "EvaluationAnswer_responseId_idx" ON "EvaluationAnswer"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationAnswer_responseId_skillId_key" ON "EvaluationAnswer"("responseId", "skillId");

-- CreateIndex
CREATE INDEX "DevelopmentPlan_consultantId_idx" ON "DevelopmentPlan"("consultantId");

-- CreateIndex
CREATE INDEX "DevelopmentAction_planId_idx" ON "DevelopmentAction"("planId");

-- CreateIndex
CREATE INDEX "ConsultantTimeOff_consultantId_startDate_idx" ON "ConsultantTimeOff"("consultantId", "startDate");

-- AddForeignKey
ALTER TABLE "Feedback"
ADD CONSTRAINT "Feedback_subjectConsultantId_fkey"
FOREIGN KEY ("subjectConsultantId") REFERENCES "Consultant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback"
ADD CONSTRAINT "Feedback_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback"
ADD CONSTRAINT "Feedback_relatedProjectId_fkey"
FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback"
ADD CONSTRAINT "Feedback_relatedClientId_fkey"
FOREIGN KEY ("relatedClientId") REFERENCES "Client"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationCycle"
ADD CONSTRAINT "EvaluationCycle_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation"
ADD CONSTRAINT "Evaluation_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "EvaluationCycle"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation"
ADD CONSTRAINT "Evaluation_subjectConsultantId_fkey"
FOREIGN KEY ("subjectConsultantId") REFERENCES "Consultant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResponse"
ADD CONSTRAINT "EvaluationResponse_evaluationId_fkey"
FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationResponse"
ADD CONSTRAINT "EvaluationResponse_raterUserId_fkey"
FOREIGN KEY ("raterUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAnswer"
ADD CONSTRAINT "EvaluationAnswer_responseId_fkey"
FOREIGN KEY ("responseId") REFERENCES "EvaluationResponse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationAnswer"
ADD CONSTRAINT "EvaluationAnswer_skillId_fkey"
FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan"
ADD CONSTRAINT "DevelopmentPlan_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan"
ADD CONSTRAINT "DevelopmentPlan_cycleId_fkey"
FOREIGN KEY ("cycleId") REFERENCES "EvaluationCycle"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentPlan"
ADD CONSTRAINT "DevelopmentPlan_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentAction"
ADD CONSTRAINT "DevelopmentAction_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "DevelopmentPlan"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DevelopmentAction"
ADD CONSTRAINT "DevelopmentAction_targetSkillId_fkey"
FOREIGN KEY ("targetSkillId") REFERENCES "Skill"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantTimeOff"
ADD CONSTRAINT "ConsultantTimeOff_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
