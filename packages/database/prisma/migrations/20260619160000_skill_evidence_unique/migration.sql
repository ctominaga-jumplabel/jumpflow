-- Idempotencia de SkillEvidence por origem (ex.: conclusao de curso da
-- Universidade Jump, onde sourceId = enrollmentId). Trava de corrida: evita
-- gravar duas evidencias para a mesma (consultantSkillId, sourceId) quando duas
-- requisicoes concluem a mesma matricula simultaneamente.
--
-- sourceId e nullable (String?). No Postgres um UNIQUE com coluna NULL permite
-- multiplos NULL (cada NULL e distinto na semantica SQL), entao a constraint so
-- restringe quando sourceId esta preenchido — exatamente o caso da evidencia de
-- curso. Usos com sourceId NULL (evidencia manual sem origem) seguem livres.
--
-- Aditivo: nenhum dado e reescrito. O SkillEvidence (P1) foi criado na migration
-- 20260619120000_talentos_competency_foundation; esta migration NAO a altera.
-- Assume que os dados existentes ja respeitam a regra (o unico criador de
-- SkillEvidence com sourceId hoje e a conclusao de curso, ja idempotente por
-- leitura). Aplicar com `npm run db:deploy` ANTES do merge na main.

-- CreateIndex
CREATE UNIQUE INDEX "SkillEvidence_consultantSkillId_sourceId_key" ON "SkillEvidence"("consultantSkillId", "sourceId");
