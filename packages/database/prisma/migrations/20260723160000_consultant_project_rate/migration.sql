-- M2: valor/hora diferenciado por consultor+projeto, com vigência (date-only).
-- Substitui o hourlyRate acordado nos lançamentos do projeto (custo + pagamento).

-- CreateTable
CREATE TABLE "ConsultantProjectRate" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hourlyRate" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "startsAt" DATE NOT NULL,
    "endsAt" DATE,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantProjectRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantProjectRate_consultantId_projectId_startsAt_idx" ON "ConsultantProjectRate"("consultantId", "projectId", "startsAt");

-- CreateIndex
CREATE INDEX "ConsultantProjectRate_projectId_idx" ON "ConsultantProjectRate"("projectId");

-- AddForeignKey
ALTER TABLE "ConsultantProjectRate" ADD CONSTRAINT "ConsultantProjectRate_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantProjectRate" ADD CONSTRAINT "ConsultantProjectRate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
