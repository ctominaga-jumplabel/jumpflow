-- Calendario de feriados (Onda A do plano de melhorias).
-- Aditivo e seguro: novo enum + nova tabela, sem alterar estruturas existentes.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateEnum
CREATE TYPE "HolidayScope" AS ENUM ('NATIONAL', 'STATE', 'CITY');

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "HolidayScope" NOT NULL DEFAULT 'NATIONAL',
    "region" TEXT,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_scope_region_key" ON "Holiday"("date", "scope", "region");

-- CreateIndex
CREATE INDEX "Holiday_year_idx" ON "Holiday"("year");
