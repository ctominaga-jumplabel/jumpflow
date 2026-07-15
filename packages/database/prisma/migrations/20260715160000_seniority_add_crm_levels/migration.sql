-- Amplia o enum Seniority para ficar 1:1 com o catalogo de senioridade do
-- CRM-Jumplabel (append dos 5 niveis que faltavam). PRINCIPAL nao tem origem no
-- CRM (valor exclusivo do JumpFlow) e permanece.
--
-- Aditivo e seguro: Postgres so permite ADD VALUE em enum existente, nunca
-- remover/renomear, entao nenhuma linha existente e afetada. Em PG12+ o ADD
-- VALUE PODE rodar dentro de transacao; a restricao real e que o valor
-- recem-adicionado nao pode ser USADO na mesma transacao. Esta migration contem
-- APENAS ALTER TYPE puro (nenhum uso dos novos valores), entao e segura.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

ALTER TYPE "Seniority" ADD VALUE 'TRAINEE';
ALTER TYPE "Seniority" ADD VALUE 'TECH_LEAD';
ALTER TYPE "Seniority" ADD VALUE 'ARCHITECT';
ALTER TYPE "Seniority" ADD VALUE 'COORDINATOR';
ALTER TYPE "Seniority" ADD VALUE 'MANAGER';
