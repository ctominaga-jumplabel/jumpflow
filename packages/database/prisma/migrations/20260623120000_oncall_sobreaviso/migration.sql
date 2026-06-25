-- Sobreaviso (on-call) — Onda 3 item 3.1.
-- Aditivo: novo enum + duas tabelas; FKs para Consultant/Project.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateEnum
CREATE TYPE "OnCallStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "OnCallEntry" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "projectId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    "status" "OnCallStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnCallEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnCallAttachment" (
    "id" TEXT NOT NULL,
    "onCallEntryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageBucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OnCallAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OnCallEntry_consultantId_date_idx" ON "OnCallEntry"("consultantId", "date");

-- CreateIndex
CREATE INDEX "OnCallEntry_status_idx" ON "OnCallEntry"("status");

-- CreateIndex
CREATE INDEX "OnCallEntry_projectId_idx" ON "OnCallEntry"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "OnCallAttachment_onCallEntryId_key" ON "OnCallAttachment"("onCallEntryId");

-- AddForeignKey
ALTER TABLE "OnCallEntry" ADD CONSTRAINT "OnCallEntry_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnCallEntry" ADD CONSTRAINT "OnCallEntry_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnCallAttachment" ADD CONSTRAINT "OnCallAttachment_onCallEntryId_fkey" FOREIGN KEY ("onCallEntryId") REFERENCES "OnCallEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
