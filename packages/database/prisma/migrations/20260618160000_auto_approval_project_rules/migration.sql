-- Aprovacao Automatica (redesign): configuracao por PROJETO em vez de excecoes
-- globais por (consultor, projeto). Remove AutoApprovalException + enum (dados
-- autorizados a serem limpos) e cria ProjectAutoApprovalRule (1:1) e
-- ConsultantAutoApprovalRule (consultor+projeto). Regras combinam fim de semana
-- e range de horas POR LANCAMENTO por OU; min/max em minutos (00:01..23:59).

-- DropTable (remove tambem as FKs para Consultant/Project)
DROP TABLE "AutoApprovalException";

-- DropEnum
DROP TYPE "AutoApprovalExceptionType";

-- CreateTable
CREATE TABLE "ProjectAutoApprovalRule" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "hoursRangeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minMinutes" INTEGER NOT NULL DEFAULT 1,
    "maxMinutes" INTEGER NOT NULL DEFAULT 1439,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectAutoApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAutoApprovalRule_projectId_key" ON "ProjectAutoApprovalRule"("projectId");

-- CreateTable
CREATE TABLE "ConsultantAutoApprovalRule" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "hoursRangeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "minMinutes" INTEGER NOT NULL DEFAULT 1,
    "maxMinutes" INTEGER NOT NULL DEFAULT 1439,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantAutoApprovalRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantAutoApprovalRule_consultantId_projectId_key" ON "ConsultantAutoApprovalRule"("consultantId", "projectId");

-- CreateIndex
CREATE INDEX "ConsultantAutoApprovalRule_projectId_idx" ON "ConsultantAutoApprovalRule"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectAutoApprovalRule" ADD CONSTRAINT "ProjectAutoApprovalRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAutoApprovalRule" ADD CONSTRAINT "ConsultantAutoApprovalRule_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantAutoApprovalRule" ADD CONSTRAINT "ConsultantAutoApprovalRule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
