-- Onda 8 / Talentos (P27 + P29). Duas frentes ADITIVAS e seguras:
--   1. ConsultantExperience: experiencia profissional DECLARADA do consultor
--      (curriculo-first). Espinha do historico profissional do curriculo,
--      distinta das Allocation (alocacoes internas). 1:N, sem dados financeiros.
--      endDate NULL = experiencia atual.
--   2. FeedbackRequest (+ enum FeedbackRequestStatus): rastreio do pedido de
--      feedback ao cliente por e-mail. NAO guarda o texto do feedback; apenas
--      o disparo (para quem, quando, por quem, status). Espelha as relacoes de
--      Feedback (subject Cascade; cliente/projeto/solicitante SetNull).
-- Nenhuma linha existente e afetada (tabelas/enum novos). Aplicar com
-- `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateEnum
CREATE TYPE "FeedbackRequestStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "ConsultantExperience" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "description" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackRequest" (
    "id" TEXT NOT NULL,
    "subjectConsultantId" TEXT NOT NULL,
    "clientId" TEXT,
    "relatedProjectId" TEXT,
    "email" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "status" "FeedbackRequestStatus" NOT NULL DEFAULT 'SENT',
    "provider" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantExperience_consultantId_idx" ON "ConsultantExperience"("consultantId");

-- CreateIndex
CREATE INDEX "FeedbackRequest_subjectConsultantId_idx" ON "FeedbackRequest"("subjectConsultantId");

-- CreateIndex
CREATE INDEX "FeedbackRequest_clientId_idx" ON "FeedbackRequest"("clientId");

-- CreateIndex
CREATE INDEX "FeedbackRequest_createdAt_idx" ON "FeedbackRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "ConsultantExperience" ADD CONSTRAINT "ConsultantExperience_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_subjectConsultantId_fkey" FOREIGN KEY ("subjectConsultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_relatedProjectId_fkey" FOREIGN KEY ("relatedProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackRequest" ADD CONSTRAINT "FeedbackRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
