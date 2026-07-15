-- Ancora anti-duplicacao (G2): unicidade de Project.commercialContractRef como
-- backstop de banco contra a corrida de ingestao (duas entregas concorrentes
-- criando dois Project para a mesma ancora). No Postgres um UNIQUE em coluna
-- anulavel admite MULTIPLOS NULLs (NULLs sao distintos), entao projetos sem
-- contrato NAO sao afetados; so bloqueia duas linhas com o MESMO ref nao-nulo.
--
-- AVISO DE DEPLOY: em prod, ANTES de aplicar, checar duplicatas de ref nao-nulo:
--   SELECT "commercialContractRef", count(*) FROM "Project"
--   WHERE "commercialContractRef" IS NOT NULL GROUP BY 1 HAVING count(*) > 1;
-- Se houver linhas, resolver manualmente (mesclar/anular) ANTES; caso contrario
-- a criacao do indice UNIQUE falha. Aplicar com `npm run db:deploy` ANTES de
-- mergear na main (gate de deploy).

-- CreateIndex
CREATE UNIQUE INDEX "Project_commercialContractRef_key" ON "Project"("commercialContractRef");
