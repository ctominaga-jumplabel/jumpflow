-- Adiciona CRM_JUMPLABEL ao enum IntegrationProviderKind: canal de ingestao de
-- projetos vindos do CRM-Jumplabel (oportunidades ganhas).
--
-- Aditivo e seguro: Postgres so permite ADD VALUE em enum existente, nunca
-- remover/renomear, entao nenhuma linha existente e afetada. Em PG12+ o ADD
-- VALUE PODE rodar dentro de transacao; a restricao real e que o valor
-- recem-adicionado nao pode ser USADO na mesma transacao. Esta migration contem
-- APENAS o ALTER TYPE puro (nenhum uso do novo valor), entao e segura.
-- Aplicar com `npm run db:deploy` ANTES de mergear na main (gate de deploy).

ALTER TYPE "IntegrationProviderKind" ADD VALUE 'CRM_JUMPLABEL';
