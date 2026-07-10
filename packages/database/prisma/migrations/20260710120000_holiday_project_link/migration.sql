-- Vinculo Holiday<->Project (Onda A-ext do plano de melhorias).
-- Aditivo e seguro: nova tabela de juncao + ajuste de indices no Holiday.
--   1. HolidayProject: N:N entre feriados e projetos. Sem linhas => feriado
--      GLOBAL (todos os projetos); com >=1 linha => vale so para os vinculados.
--   2. Holiday: remove o indice unico [date, scope, region] (falsa garantia no
--      Postgres, pois NULLs sao distintos e region NULL nos nacionais permitia
--      duplicatas) e adiciona indice de consulta [date, scope]. A de-duplicacao
--      passa a ser responsabilidade da Server Action de CRUD.
-- Nenhuma coluna existente e removida e nenhum dado e perdido.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

-- DropIndex
DROP INDEX "Holiday_date_scope_region_key";

-- CreateIndex
CREATE INDEX "Holiday_date_scope_idx" ON "Holiday"("date", "scope");

-- CreateTable
CREATE TABLE "HolidayProject" (
    "holidayId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayProject_pkey" PRIMARY KEY ("holidayId","projectId")
);

-- CreateIndex
CREATE INDEX "HolidayProject_projectId_idx" ON "HolidayProject"("projectId");

-- AddForeignKey
ALTER TABLE "HolidayProject" ADD CONSTRAINT "HolidayProject_holidayId_fkey" FOREIGN KEY ("holidayId") REFERENCES "Holiday"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HolidayProject" ADD CONSTRAINT "HolidayProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
