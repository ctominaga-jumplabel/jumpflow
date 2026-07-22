-- Onda 4 / P9 (Horas — justificativa obrigatoria ao marcar NAO faturavel).
-- Duas mudancas ADITIVAS e seguras:
--   1. TimeEntry.nonBillableReason: motivo obrigatorio quando um GESTOR marca o
--      lancamento como nao faturavel. NULL quando faturavel (comportamento
--      atual preservado). A derivacao automatica do consultor (ON_CALL) NAO
--      preenche este campo — so a acao explicita de gestao.
--   2. TimeEntryBillableJustificationAttachment: anexo opcional 1:1 DEDICADO
--      (espelha TimeEntryAttachment, mas e um artefato distinto do anexo
--      proprio do lancamento, para nao conflitar). Vive em bucket privado
--      dedicado; a URL e sempre assinada.
-- Nenhuma linha existente e afetada (coluna opcional + tabela nova). Aplicar
-- com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "nonBillableReason" TEXT;

-- CreateTable
CREATE TABLE "TimeEntryBillableJustificationAttachment" (
    "id" TEXT NOT NULL,
    "timeEntryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeEntryBillableJustificationAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntryBillableJustificationAttachment_timeEntryId_key" ON "TimeEntryBillableJustificationAttachment"("timeEntryId");

-- AddForeignKey
ALTER TABLE "TimeEntryBillableJustificationAttachment" ADD CONSTRAINT "TimeEntryBillableJustificationAttachment_timeEntryId_fkey" FOREIGN KEY ("timeEntryId") REFERENCES "TimeEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
