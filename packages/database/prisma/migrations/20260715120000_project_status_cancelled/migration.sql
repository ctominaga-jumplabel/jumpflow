-- Adiciona CANCELLED ao enum ProjectStatus (reversao pos-ganho da ingestao
-- CRM-Jumplabel). Estado terminal alternativo a CLOSED que preserva o historico
-- (nunca deletar; pode haver TimeEntry vinculado).
--
-- Aditivo e seguro: Postgres so permite ADD VALUE em enum existente, nunca
-- remover/renomear, entao nenhuma linha existente e afetada. Em PG12+ o ADD
-- VALUE PODE rodar dentro de transacao; a restricao real e que o valor
-- recem-adicionado nao pode ser USADO na mesma transacao. Esta migration contem
-- APENAS o ALTER TYPE puro (nenhum uso do novo valor), entao e segura.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

ALTER TYPE "ProjectStatus" ADD VALUE 'CANCELLED';
