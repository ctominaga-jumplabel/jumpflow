-- Onda 2 / P4 (Cobranca de projetos). Duas colunas ADITIVAS e seguras:
--   1. Client.billingEmails: lista de e-mails de cobranca do cliente. Quando
--      nao-vazia, e a fonte de destinatarios do e-mail de pre-fatura; senao cai
--      no fallback contactEmail. DEFAULT '{}' => clientes existentes ficam com
--      lista vazia (comportamento atual preservado: usa contactEmail).
--   2. Project.billingAttachHours: flag para anexar a planilha de horas por
--      consultor (competencia do fechamento) ao e-mail de cobranca. DEFAULT
--      false => projetos existentes nao anexam nada (comportamento atual).
-- Nenhuma linha existente e afetada. Aplicar com `npm run db:deploy` ANTES de
-- mergear na main (gate de deploy).

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "billingEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "billingAttachHours" BOOLEAN NOT NULL DEFAULT false;
