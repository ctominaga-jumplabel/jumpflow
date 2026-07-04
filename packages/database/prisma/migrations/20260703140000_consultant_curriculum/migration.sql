-- Curriculo do Consultor (EP-M06). Aditivo e seguro: duas colunas nullable de
-- bio curada em "Consultant" e uma nova tabela de snapshots versionados. Nao
-- toca em estrutura existente nem contem dados financeiros.
--
-- - Consultant.curriculumHeadline / curriculumSummary: unica parte NAO-derivada
--   do curriculo (bio curada por People). O restante do curriculo e montado sob
--   demanda a partir das tabelas-fonte (read-model), sempre atualizado.
-- - ConsultantCurriculumSnapshot: congela o agregado derivado em "content"
--   (JSON) para historico + versao imprimivel estavel. SEM assinatura.
--   "pdfStorageKey" fica reservado para futura geracao server-side de PDF.
--   FK consultantId ON DELETE CASCADE; generatedByUserId ON DELETE SET NULL.
--
-- IMPORTANTE: o motor de migrate do Prisma TRAVA no pooler do Supabase; esta
-- migration deve ser aplicada pelo OPS via o mecanismo usado no repo
-- (PrismaClient.$executeRawUnsafe + registro manual em _prisma_migrations com
-- sha256). Este migration.sql e a fonte canonica.

-- AlterTable
ALTER TABLE "Consultant" ADD COLUMN "curriculumHeadline" TEXT;
ALTER TABLE "Consultant" ADD COLUMN "curriculumSummary" TEXT;

-- CreateTable
CREATE TABLE "ConsultantCurriculumSnapshot" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "generatedByUserId" TEXT,
    "pdfStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsultantCurriculumSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantCurriculumSnapshot_consultantId_createdAt_idx" ON "ConsultantCurriculumSnapshot"("consultantId", "createdAt");

-- AddForeignKey
ALTER TABLE "ConsultantCurriculumSnapshot" ADD CONSTRAINT "ConsultantCurriculumSnapshot_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantCurriculumSnapshot" ADD CONSTRAINT "ConsultantCurriculumSnapshot_generatedByUserId_fkey" FOREIGN KEY ("generatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
