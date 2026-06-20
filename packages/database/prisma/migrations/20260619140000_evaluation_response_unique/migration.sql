-- Avaliacao 90/180/360 (EP16): unicidade por (evaluation, relationship).
-- Trava de corrida na abertura do ciclo (transitionCycle -> openCycle): garante
-- uma unica EvaluationResponse por relacionamento dentro de cada avaliacao, de
-- modo que `createMany({ skipDuplicates: true })` seja idempotente sob reabertura
-- concorrente (antes a idempotencia dependia de um check de leitura nao atomico).
-- Aditivo: nenhum dado e reescrito. Assume que os dados existentes ja respeitam
-- a regra (a abertura sempre cria no maximo uma resposta por relacionamento).

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationResponse_evaluationId_relationship_key" ON "EvaluationResponse"("evaluationId", "relationship");
