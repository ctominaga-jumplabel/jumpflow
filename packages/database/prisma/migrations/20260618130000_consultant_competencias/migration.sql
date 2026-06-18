-- Consultores (Story 2): competencias do consultor (idiomas e formacao
-- academica). Migracao puramente aditiva: dois enums e duas tabelas novas.
-- Nenhuma estrutura existente e alterada.

-- CreateEnum
CREATE TYPE "LanguageLevel" AS ENUM ('BASIC', 'INTERMEDIATE', 'ADVANCED', 'FLUENT', 'NATIVE');

-- CreateEnum
CREATE TYPE "EducationDegree" AS ENUM ('HIGH_SCHOOL', 'TECHNICAL', 'UNDERGRADUATE', 'POSTGRADUATE', 'MASTERS', 'DOCTORATE', 'OTHER');

-- CreateTable
CREATE TABLE "ConsultantLanguage" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "LanguageLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantLanguage_consultantId_idx" ON "ConsultantLanguage"("consultantId");

-- CreateTable
CREATE TABLE "ConsultantEducation" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "degree" "EducationDegree" NOT NULL,
    "startYear" INTEGER,
    "endYear" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantEducation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultantEducation_consultantId_idx" ON "ConsultantEducation"("consultantId");

-- AddForeignKey
ALTER TABLE "ConsultantLanguage" ADD CONSTRAINT "ConsultantLanguage_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantEducation" ADD CONSTRAINT "ConsultantEducation_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
