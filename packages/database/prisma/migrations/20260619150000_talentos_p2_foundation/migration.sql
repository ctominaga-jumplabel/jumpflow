-- Prioridade 2 (Desenvolvimento & Talentos): engajamento e capacitacao. Cobre:
--   1. Pesquisa de Clima / NPS interno (EP 7.1): Survey / SurveyQuestion /
--      SurveyInvitation / SurveyResponse / SurveyAnswer.
--   2. Metas e OKRs (EP 7.2): Objective / KeyResult.
--   3. Universidade Jump (EP 7.3): LearningTrack / Course / Enrollment.
--
-- ANONIMATO (regra de modelagem do clima): SurveyResponse NAO referencia
-- consultantId. O unico vinculo possivel e via SurveyInvitation (SetNull,
-- opcional). SurveyInvitation e o UNICO controle de "quem respondeu" (status),
-- deliberadamente desacoplado do conteudo da resposta. Em pesquisa anonima a
-- aplicacao NAO deve usar esse vinculo para reidentificar o respondente.
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
CREATE TYPE "SurveyType" AS ENUM ('CLIMATE', 'NPS', 'SATISFACTION', 'LEADERSHIP', 'PULSE');

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "SurveyQuestionType" AS ENUM ('SCALE', 'NPS', 'TEXT', 'CHOICE');

-- CreateEnum
CREATE TYPE "SurveyInvitationStatus" AS ENUM ('PENDING', 'ANSWERED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ObjectiveScope" AS ENUM ('CONSULTANT', 'PROJECT', 'AREA', 'COMPANY');

-- CreateEnum
CREATE TYPE "ObjectiveStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KeyResultMetric" AS ENUM ('NUMBER', 'PERCENT', 'CURRENCY', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "LearningStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "SurveyType" NOT NULL,
    "anonymous" BOOLEAN NOT NULL DEFAULT true,
    "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" "SurveyQuestionType" NOT NULL,
    "options" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyInvitation" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "SurveyInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "invitationId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "scoreValue" INTEGER,
    "choiceValue" TEXT,
    "textValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Objective" (
    "id" TEXT NOT NULL,
    "scope" "ObjectiveScope" NOT NULL,
    "referenceKey" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ObjectiveStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT,
    "consultantId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Objective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyResult" (
    "id" TEXT NOT NULL,
    "objectiveId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metricType" "KeyResultMetric" NOT NULL DEFAULT 'NUMBER',
    "startValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "targetValue" DECIMAL(14,2) NOT NULL,
    "currentValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "autoSource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "status" "LearningStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearningTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "trackId" TEXT,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "hours" DECIMAL(6,2),
    "externalUrl" TEXT,
    "skillId" TEXT,
    "status" "LearningStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ENROLLED',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "hoursCompleted" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurveyQuestion_surveyId_idx" ON "SurveyQuestion"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyInvitation_tokenHash_key" ON "SurveyInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "SurveyInvitation_surveyId_idx" ON "SurveyInvitation"("surveyId");

-- CreateIndex
CREATE UNIQUE INDEX "SurveyInvitation_surveyId_consultantId_key" ON "SurveyInvitation"("surveyId", "consultantId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyAnswer_responseId_idx" ON "SurveyAnswer"("responseId");

-- CreateIndex
CREATE INDEX "Objective_scope_referenceKey_idx" ON "Objective"("scope", "referenceKey");

-- CreateIndex
CREATE INDEX "Objective_consultantId_idx" ON "Objective"("consultantId");

-- CreateIndex
CREATE INDEX "Objective_projectId_idx" ON "Objective"("projectId");

-- CreateIndex
CREATE INDEX "KeyResult_objectiveId_idx" ON "KeyResult"("objectiveId");

-- CreateIndex
CREATE INDEX "Course_trackId_idx" ON "Course"("trackId");

-- CreateIndex
CREATE INDEX "Course_skillId_idx" ON "Course"("skillId");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_consultantId_courseId_key" ON "Enrollment"("consultantId", "courseId");

-- CreateIndex
CREATE INDEX "Enrollment_consultantId_idx" ON "Enrollment"("consultantId");

-- CreateIndex
CREATE INDEX "Enrollment_courseId_idx" ON "Enrollment"("courseId");

-- AddForeignKey
ALTER TABLE "Survey"
ADD CONSTRAINT "Survey_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion"
ADD CONSTRAINT "SurveyQuestion_surveyId_fkey"
FOREIGN KEY ("surveyId") REFERENCES "Survey"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyInvitation"
ADD CONSTRAINT "SurveyInvitation_surveyId_fkey"
FOREIGN KEY ("surveyId") REFERENCES "Survey"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyInvitation"
ADD CONSTRAINT "SurveyInvitation_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse"
ADD CONSTRAINT "SurveyResponse_surveyId_fkey"
FOREIGN KEY ("surveyId") REFERENCES "Survey"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse"
ADD CONSTRAINT "SurveyResponse_invitationId_fkey"
FOREIGN KEY ("invitationId") REFERENCES "SurveyInvitation"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer"
ADD CONSTRAINT "SurveyAnswer_responseId_fkey"
FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer"
ADD CONSTRAINT "SurveyAnswer_questionId_fkey"
FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective"
ADD CONSTRAINT "Objective_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective"
ADD CONSTRAINT "Objective_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Objective"
ADD CONSTRAINT "Objective_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "Project"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyResult"
ADD CONSTRAINT "KeyResult_objectiveId_fkey"
FOREIGN KEY ("objectiveId") REFERENCES "Objective"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course"
ADD CONSTRAINT "Course_trackId_fkey"
FOREIGN KEY ("trackId") REFERENCES "LearningTrack"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course"
ADD CONSTRAINT "Course_skillId_fkey"
FOREIGN KEY ("skillId") REFERENCES "Skill"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment"
ADD CONSTRAINT "Enrollment_consultantId_fkey"
FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment"
ADD CONSTRAINT "Enrollment_courseId_fkey"
FOREIGN KEY ("courseId") REFERENCES "Course"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
