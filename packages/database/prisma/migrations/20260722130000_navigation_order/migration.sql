-- Ordem GLOBAL do menu principal (P28 — Onda 7, Shell de UI).
-- Aditivo e seguro: nova tabela, sem alterar estruturas existentes.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- CreateTable
CREATE TABLE "NavigationOrder" (
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NavigationOrder_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "NavigationOrder_position_idx" ON "NavigationOrder"("position");
