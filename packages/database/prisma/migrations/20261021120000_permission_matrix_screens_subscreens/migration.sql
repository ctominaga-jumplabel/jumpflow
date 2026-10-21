-- Matriz de Permissões "de verdade" (data migration, idempotente).
--
-- 1. CRIA as funcionalidades das telas que eram só role-gated (Cockpit do
--    Gestor, Minhas Notas, Política de Reembolso, Status de Faturamento, Ordem
--    do Menu, Painel de Talentos) e as SUBTELAS (abas) de cada tela, com os
--    rótulos exatos da UI.
-- 2. ALINHA nome/módulo/tela pai/ordem de TODO o catálogo nativo às telas e
--    aos grupos do menu (espelha seed.mjs e align-permission-catalog.mjs).
-- 3. INATIVA os codes nativos sem tela correspondente (nunca checados).
-- 4. GRANTS sem mudança de acesso no dia 1:
--    - subtela nova = CÓPIA das células ATUAIS da tela pai (respeita ajustes
--      feitos pelo ADMIN em prod). Quem vê a tela continua vendo todas as abas.
--    - tela antes role-gated = os mesmos papéis do gate de rota atual.
--    - codes nativos que passam a ser checados e eram inertes (HORAS_LANCAMENTOS,
--      HORAS_RELATORIOS, PROJETOS_EQUIPES, PROJETOS_RELATORIOS) = cópia do pai
--      (em prod o CONSULTANT estava zerado neles pela EP-M09).
--
-- NÃO remove permissões existentes de ninguém, NÃO toca códigos criados pelo
-- ADMIN na tela e NÃO cria/remove grupos. Rodar de novo é no-op: INSERTs usam
-- ON CONFLICT DO NOTHING e os UPDATEs são determinísticos. Roda no boot do
-- Railway (`npm run db:deploy`) ANTES do app que lê os novos codes.

-- 1. Novas funcionalidades
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_minhas_notas', 'MINHAS_NOTAS', 'Minhas Notas', 'Despesas', 25, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_despesas_politica', 'DESPESAS_POLITICA', 'Política de Reembolso', 'Despesas', 22, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_operacao_cockpit', 'OPERACAO_COCKPIT', 'Cockpit do Gestor', 'Operação', 25, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_financeiro_status_faturamento', 'FINANCEIRO_STATUS_FATURAMENTO', 'Status de Faturamento', 'Financeiro', 112, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_configuracoes_menu', 'CONFIGURACOES_MENU', 'Ordem do Menu', 'Administração', 125, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_operacao_fechamento_detalhamento', 'OPERACAO_FECHAMENTO_DETALHAMENTO', 'Detalhamento por consultor', 'Operação', 26, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_projetos_skills', 'PROJETOS_SKILLS', 'Skills', 'Projetos & Clientes', 35, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_projetos_aprovacao', 'PROJETOS_APROVACAO', 'Aprovação', 'Projetos & Clientes', 36, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_projetos_recebimentos', 'PROJETOS_RECEBIMENTOS', 'Recebimentos previstos', 'Projetos & Clientes', 37, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_projetos_cobranca', 'PROJETOS_COBRANCA', 'Cobrança', 'Projetos & Clientes', 38, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_clientes_tipos_cobranca', 'CLIENTES_TIPOS_COBRANCA', 'Tipos de cobrança', 'Projetos & Clientes', 41, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_painel_talentos', 'PAINEL_TALENTOS', 'Painel de Talentos', 'Pessoas', 61, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_painel_talentos_talent_finder', 'PAINEL_TALENTOS_TALENT_FINDER', 'Talent Finder', 'Pessoas', 61, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_painel_talentos_skills', 'PAINEL_TALENTOS_SKILLS', 'Skills', 'Pessoas', 62, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_painel_talentos_certificacoes', 'PAINEL_TALENTOS_CERTIFICACOES', 'Certificações', 'Pessoas', 63, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_painel_talentos_consultores', 'PAINEL_TALENTOS_CONSULTORES', 'Consultores', 'Pessoas', 64, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_painel_talentos_matriz_skills', 'PAINEL_TALENTOS_MATRIZ_SKILLS', 'Matriz de Skills', 'Pessoas', 65, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_painel_talentos_inativos', 'PAINEL_TALENTOS_INATIVOS', 'Banco de Inativos', 'Pessoas', 66, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_painel_talentos_governanca', 'PAINEL_TALENTOS_GOVERNANCA', 'Governança', 'Pessoas', 67, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_skills_curriculo', 'SKILLS_CURRICULO', 'Meu Currículo', 'Pessoas', 62, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_skills_catalogo', 'SKILLS_CATALOGO', 'Catálogo', 'Pessoas', 63, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_coe_composicao', 'COE_COMPOSICAO', 'Composição de time', 'Inteligência', 84, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_coe_propostas', 'COE_PROPOSTAS', 'Propostas salvas', 'Inteligência', 85, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_coe_curadoria', 'COE_CURADORIA', 'Curadoria', 'Inteligência', 86, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_relatorios_despesas', 'RELATORIOS_DESPESAS', 'Despesas', 'Relatórios & Análises', 102, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_relatorios_consolidado', 'RELATORIOS_CONSOLIDADO', 'Consolidado', 'Relatórios & Análises', 103, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_financeiro_contas_receber', 'FINANCEIRO_CONTAS_RECEBER', 'Contas a Receber', 'Financeiro', 110, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
INSERT INTO "Permission" ("id", "code", "name", "module", "sortOrder", "active", "createdAt", "updatedAt")
VALUES ('perm_financeiro_contas_pagar', 'FINANCEIRO_CONTAS_PAGAR', 'Contas a Pagar', 'Financeiro', 111, true, NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;

-- 2. Alinhamento do catálogo nativo (nome, módulo, ordem, tela pai)
UPDATE "Permission" SET "name" = 'Dashboard', "module" = 'Relatórios & Análises', "sortOrder" = 0, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'DASHBOARD';
UPDATE "Permission" SET "name" = 'Horas', "module" = 'Horas', "sortOrder" = 10, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'HORAS';
UPDATE "Permission" SET "name" = 'Novo lançamento', "module" = 'Horas', "sortOrder" = 11, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'HORAS'), "updatedAt" = NOW() WHERE "code" = 'HORAS_LANCAMENTOS';
UPDATE "Permission" SET "name" = 'Aprovações de horas', "module" = 'Horas', "sortOrder" = 12, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'HORAS'), "updatedAt" = NOW() WHERE "code" = 'HORAS_APROVACOES';
UPDATE "Permission" SET "name" = 'Horas', "module" = 'Relatórios & Análises', "sortOrder" = 101, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'RELATORIOS'), "updatedAt" = NOW() WHERE "code" = 'HORAS_RELATORIOS';
UPDATE "Permission" SET "name" = 'Despesas', "module" = 'Despesas', "sortOrder" = 20, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'DESPESAS';
UPDATE "Permission" SET "name" = 'Status de pagamento', "module" = 'Despesas', "sortOrder" = 21, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'DESPESAS'), "updatedAt" = NOW() WHERE "code" = 'DESPESAS_PAGAMENTO';
UPDATE "Permission" SET "name" = 'Sobreaviso', "module" = 'Horas', "sortOrder" = 14, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'HORAS'), "updatedAt" = NOW() WHERE "code" = 'SOBREAVISO';
UPDATE "Permission" SET "name" = 'Ausências', "module" = 'Operação', "sortOrder" = 23, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'AUSENCIAS';
UPDATE "Permission" SET "name" = 'Fechamento Operacional', "module" = 'Operação', "sortOrder" = 24, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'OPERACAO_FECHAMENTO';
UPDATE "Permission" SET "name" = 'Projetos', "module" = 'Projetos & Clientes', "sortOrder" = 30, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'PROJETOS';
UPDATE "Permission" SET "name" = 'Cadastro', "module" = 'Projetos & Clientes', "sortOrder" = 31, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PROJETOS'), "updatedAt" = NOW() WHERE "code" = 'PROJETOS_CADASTRO';
UPDATE "Permission" SET "name" = 'Vínculos', "module" = 'Projetos & Clientes', "sortOrder" = 32, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PROJETOS'), "updatedAt" = NOW() WHERE "code" = 'PROJETOS_EQUIPES';
UPDATE "Permission" SET "name" = 'Valores de venda', "module" = 'Projetos & Clientes', "sortOrder" = 33, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PROJETOS'), "updatedAt" = NOW() WHERE "code" = 'PROJETOS_FINANCEIRO';
UPDATE "Permission" SET "name" = 'Acompanhamento', "module" = 'Projetos & Clientes', "sortOrder" = 34, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PROJETOS'), "updatedAt" = NOW() WHERE "code" = 'PROJETOS_RELATORIOS';
UPDATE "Permission" SET "name" = 'Clientes', "module" = 'Projetos & Clientes', "sortOrder" = 40, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CLIENTES';
UPDATE "Permission" SET "name" = 'Comercial', "module" = 'Projetos & Clientes', "sortOrder" = 50, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'COMERCIAL';
UPDATE "Permission" SET "name" = 'Consultores', "module" = 'Pessoas', "sortOrder" = 60, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CONSULTORES';
UPDATE "Permission" SET "name" = 'Informações pessoais', "module" = 'Pessoas', "sortOrder" = 60, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'CONSULTORES'), "updatedAt" = NOW() WHERE "code" = 'CONSULTORES_PESSOAIS';
UPDATE "Permission" SET "name" = 'Documentações', "module" = 'Pessoas', "sortOrder" = 60, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'CONSULTORES'), "updatedAt" = NOW() WHERE "code" = 'CONSULTORES_DOCUMENTOS';
UPDATE "Permission" SET "name" = 'Currículo', "module" = 'Pessoas', "sortOrder" = 60, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'CONSULTORES'), "updatedAt" = NOW() WHERE "code" = 'CONSULTORES_CURRICULO';
UPDATE "Permission" SET "name" = 'Contas bancárias', "module" = 'Pessoas', "sortOrder" = 60, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'CONSULTORES'), "updatedAt" = NOW() WHERE "code" = 'CONSULTORES_BANCARIAS';
UPDATE "Permission" SET "name" = 'Valores e remuneração', "module" = 'Pessoas', "sortOrder" = 60, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'CONSULTORES'), "updatedAt" = NOW() WHERE "code" = 'CONSULTORES_REMUNERACAO';
UPDATE "Permission" SET "name" = 'Skills', "module" = 'Pessoas', "sortOrder" = 61, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'SKILLS';
UPDATE "Permission" SET "name" = 'Competências', "module" = 'Pessoas', "sortOrder" = 62, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'COMPETENCIAS';
UPDATE "Permission" SET "name" = 'Disponibilidade', "module" = 'Pessoas', "sortOrder" = 63, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'DISPONIBILIDADE';
UPDATE "Permission" SET "name" = 'Certificados', "module" = 'Pessoas', "sortOrder" = 64, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CERTIFICADOS';
UPDATE "Permission" SET "name" = 'Checkpoints', "module" = 'Pessoas', "sortOrder" = 65, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CHECKPOINT';
UPDATE "Permission" SET "name" = 'Oportunidades', "module" = 'Pessoas', "sortOrder" = 66, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'CHECKPOINT'), "updatedAt" = NOW() WHERE "code" = 'OPPORTUNITY';
UPDATE "Permission" SET "name" = 'Cases', "module" = 'Pessoas', "sortOrder" = 67, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'CHECKPOINT'), "updatedAt" = NOW() WHERE "code" = 'CASE';
UPDATE "Permission" SET "name" = 'Feedback', "module" = 'Desenvolvimento', "sortOrder" = 70, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'FEEDBACK';
UPDATE "Permission" SET "name" = 'Avaliações', "module" = 'Desenvolvimento', "sortOrder" = 71, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'AVALIACOES';
UPDATE "Permission" SET "name" = 'PDI', "module" = 'Desenvolvimento', "sortOrder" = 72, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'PDI';
UPDATE "Permission" SET "name" = 'Clima', "module" = 'Desenvolvimento', "sortOrder" = 73, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CLIMA';
UPDATE "Permission" SET "name" = 'Metas', "module" = 'Desenvolvimento', "sortOrder" = 74, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'METAS';
UPDATE "Permission" SET "name" = 'JumpAcademy', "module" = 'Desenvolvimento', "sortOrder" = 75, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'UNIVERSIDADE';
UPDATE "Permission" SET "name" = 'IA de Alocação', "module" = 'Relatórios & Análises', "sortOrder" = 80, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'ALOCACAO_IA';
UPDATE "Permission" SET "name" = 'Risco de Projetos', "module" = 'Relatórios & Análises', "sortOrder" = 81, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'RISCO_PROJETOS';
UPDATE "Permission" SET "name" = 'Score', "module" = 'Relatórios & Análises', "sortOrder" = 82, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'SCORE_CONSULTOR';
UPDATE "Permission" SET "name" = 'Painel COE', "module" = 'Inteligência', "sortOrder" = 83, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'COE';
UPDATE "Permission" SET "name" = 'Feed', "module" = 'Comunicação', "sortOrder" = 85, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'FEED';
UPDATE "Permission" SET "name" = 'Aprovações', "module" = 'Operação', "sortOrder" = 90, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'APROVACOES';
UPDATE "Permission" SET "name" = 'Regras de aprovação automática', "module" = 'Administração', "sortOrder" = 124, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'AUTOMACOES';
UPDATE "Permission" SET "name" = 'Relatórios', "module" = 'Relatórios & Análises', "sortOrder" = 100, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'RELATORIOS';
UPDATE "Permission" SET "name" = 'Filtro por consultor', "module" = 'Relatórios & Análises', "sortOrder" = 104, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'RELATORIOS'), "updatedAt" = NOW() WHERE "code" = 'RELATORIOS_CONSULTORES';
UPDATE "Permission" SET "name" = 'Financeiro', "module" = 'Financeiro', "sortOrder" = 110, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'FINANCEIRO';
UPDATE "Permission" SET "name" = 'Cobrança de projetos', "module" = 'Financeiro', "sortOrder" = 111, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'FINANCEIRO'), "updatedAt" = NOW() WHERE "code" = 'FINANCEIRO_COBRANCA';
UPDATE "Permission" SET "name" = 'Fechamento mensal', "module" = 'Financeiro', "sortOrder" = 112, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'FINANCEIRO'), "updatedAt" = NOW() WHERE "code" = 'FINANCEIRO_FECHAMENTO';
UPDATE "Permission" SET "name" = 'Pagamentos', "module" = 'Financeiro', "sortOrder" = 113, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'PAGAMENTOS';
UPDATE "Permission" SET "name" = 'Acessos', "module" = 'Administração', "sortOrder" = 120, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'ADMIN_ACESSOS';
UPDATE "Permission" SET "name" = 'Matriz de Permissões', "module" = 'Administração', "sortOrder" = 121, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CONFIGURACOES_PERMISSOES';
UPDATE "Permission" SET "name" = 'Regras de Notificação', "module" = 'Administração', "sortOrder" = 122, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CONFIGURACOES_NOTIFICACOES';
UPDATE "Permission" SET "name" = 'Feriados', "module" = 'Administração', "sortOrder" = 123, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CONFIGURACOES_FERIADOS';
UPDATE "Permission" SET "name" = 'Minhas Notas', "module" = 'Despesas', "sortOrder" = 25, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'MINHAS_NOTAS';
UPDATE "Permission" SET "name" = 'Política de Reembolso', "module" = 'Despesas', "sortOrder" = 22, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'DESPESAS'), "updatedAt" = NOW() WHERE "code" = 'DESPESAS_POLITICA';
UPDATE "Permission" SET "name" = 'Cockpit do Gestor', "module" = 'Operação', "sortOrder" = 25, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'OPERACAO_COCKPIT';
UPDATE "Permission" SET "name" = 'Detalhamento por consultor', "module" = 'Operação', "sortOrder" = 26, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'OPERACAO_FECHAMENTO'), "updatedAt" = NOW() WHERE "code" = 'OPERACAO_FECHAMENTO_DETALHAMENTO';
UPDATE "Permission" SET "name" = 'Skills', "module" = 'Projetos & Clientes', "sortOrder" = 35, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PROJETOS'), "updatedAt" = NOW() WHERE "code" = 'PROJETOS_SKILLS';
UPDATE "Permission" SET "name" = 'Aprovação', "module" = 'Projetos & Clientes', "sortOrder" = 36, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PROJETOS'), "updatedAt" = NOW() WHERE "code" = 'PROJETOS_APROVACAO';
UPDATE "Permission" SET "name" = 'Recebimentos previstos', "module" = 'Projetos & Clientes', "sortOrder" = 37, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PROJETOS'), "updatedAt" = NOW() WHERE "code" = 'PROJETOS_RECEBIMENTOS';
UPDATE "Permission" SET "name" = 'Cobrança', "module" = 'Projetos & Clientes', "sortOrder" = 38, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PROJETOS'), "updatedAt" = NOW() WHERE "code" = 'PROJETOS_COBRANCA';
UPDATE "Permission" SET "name" = 'Tipos de cobrança', "module" = 'Projetos & Clientes', "sortOrder" = 41, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'CLIENTES'), "updatedAt" = NOW() WHERE "code" = 'CLIENTES_TIPOS_COBRANCA';
UPDATE "Permission" SET "name" = 'Painel de Talentos', "module" = 'Pessoas', "sortOrder" = 61, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'PAINEL_TALENTOS';
UPDATE "Permission" SET "name" = 'Talent Finder', "module" = 'Pessoas', "sortOrder" = 61, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PAINEL_TALENTOS'), "updatedAt" = NOW() WHERE "code" = 'PAINEL_TALENTOS_TALENT_FINDER';
UPDATE "Permission" SET "name" = 'Skills', "module" = 'Pessoas', "sortOrder" = 62, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PAINEL_TALENTOS'), "updatedAt" = NOW() WHERE "code" = 'PAINEL_TALENTOS_SKILLS';
UPDATE "Permission" SET "name" = 'Certificações', "module" = 'Pessoas', "sortOrder" = 63, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PAINEL_TALENTOS'), "updatedAt" = NOW() WHERE "code" = 'PAINEL_TALENTOS_CERTIFICACOES';
UPDATE "Permission" SET "name" = 'Consultores', "module" = 'Pessoas', "sortOrder" = 64, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PAINEL_TALENTOS'), "updatedAt" = NOW() WHERE "code" = 'PAINEL_TALENTOS_CONSULTORES';
UPDATE "Permission" SET "name" = 'Matriz de Skills', "module" = 'Pessoas', "sortOrder" = 65, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PAINEL_TALENTOS'), "updatedAt" = NOW() WHERE "code" = 'PAINEL_TALENTOS_MATRIZ_SKILLS';
UPDATE "Permission" SET "name" = 'Banco de Inativos', "module" = 'Pessoas', "sortOrder" = 66, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PAINEL_TALENTOS'), "updatedAt" = NOW() WHERE "code" = 'PAINEL_TALENTOS_INATIVOS';
UPDATE "Permission" SET "name" = 'Governança', "module" = 'Pessoas', "sortOrder" = 67, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'PAINEL_TALENTOS'), "updatedAt" = NOW() WHERE "code" = 'PAINEL_TALENTOS_GOVERNANCA';
UPDATE "Permission" SET "name" = 'Meu Currículo', "module" = 'Pessoas', "sortOrder" = 62, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'SKILLS'), "updatedAt" = NOW() WHERE "code" = 'SKILLS_CURRICULO';
UPDATE "Permission" SET "name" = 'Catálogo', "module" = 'Pessoas', "sortOrder" = 63, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'SKILLS'), "updatedAt" = NOW() WHERE "code" = 'SKILLS_CATALOGO';
UPDATE "Permission" SET "name" = 'Composição de time', "module" = 'Inteligência', "sortOrder" = 84, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'COE'), "updatedAt" = NOW() WHERE "code" = 'COE_COMPOSICAO';
UPDATE "Permission" SET "name" = 'Propostas salvas', "module" = 'Inteligência', "sortOrder" = 85, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'COE'), "updatedAt" = NOW() WHERE "code" = 'COE_PROPOSTAS';
UPDATE "Permission" SET "name" = 'Curadoria', "module" = 'Inteligência', "sortOrder" = 86, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'COE'), "updatedAt" = NOW() WHERE "code" = 'COE_CURADORIA';
UPDATE "Permission" SET "name" = 'Despesas', "module" = 'Relatórios & Análises', "sortOrder" = 102, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'RELATORIOS'), "updatedAt" = NOW() WHERE "code" = 'RELATORIOS_DESPESAS';
UPDATE "Permission" SET "name" = 'Consolidado', "module" = 'Relatórios & Análises', "sortOrder" = 103, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'RELATORIOS'), "updatedAt" = NOW() WHERE "code" = 'RELATORIOS_CONSOLIDADO';
UPDATE "Permission" SET "name" = 'Contas a Receber', "module" = 'Financeiro', "sortOrder" = 110, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'FINANCEIRO'), "updatedAt" = NOW() WHERE "code" = 'FINANCEIRO_CONTAS_RECEBER';
UPDATE "Permission" SET "name" = 'Contas a Pagar', "module" = 'Financeiro', "sortOrder" = 111, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'FINANCEIRO'), "updatedAt" = NOW() WHERE "code" = 'FINANCEIRO_CONTAS_PAGAR';
UPDATE "Permission" SET "name" = 'Status de Faturamento', "module" = 'Financeiro', "sortOrder" = 112, "parentId" = (SELECT p."id" FROM "Permission" p WHERE p."code" = 'FINANCEIRO'), "updatedAt" = NOW() WHERE "code" = 'FINANCEIRO_STATUS_FATURAMENTO';
UPDATE "Permission" SET "name" = 'Ordem do Menu', "module" = 'Administração', "sortOrder" = 125, "parentId" = NULL, "updatedAt" = NOW() WHERE "code" = 'CONFIGURACOES_MENU';

-- 3. Inativa codes nativos sem tela correspondente
UPDATE "Permission" SET "active" = false, "updatedAt" = NOW() WHERE "code" IN ('HORAS_APROVACOES', 'DESPESAS_PAGAMENTO', 'SOBREAVISO', 'PROJETOS_CADASTRO', 'FINANCEIRO_FECHAMENTO');

-- 4a0. ANTES das cópias: garante view para quem o gate de PAPEL já libera hoje
--      nos codes inertes que passam a ser checados (as abas financeiras do
--      detalhe de Projetos eram exibidas por SALE_RATE_ROLES/FINANCIAL_ROLES, e
--      Regras de aprovação automática por ADMIN/AREA_MANAGER na rota).
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN', 'AREA_MANAGER', 'FINANCE', 'SALES') AND np."code" = 'PROJETOS_FINANCEIRO'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "canView" = true, "updatedAt" = NOW();
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN', 'AREA_MANAGER') AND np."code" = 'AUTOMACOES'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "canView" = true, "updatedAt" = NOW();

-- 4a. Subtelas/telas novas: cópia das células atuais da origem
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'OPERACAO_FECHAMENTO'
CROSS JOIN "Permission" np
WHERE np."code" = 'OPERACAO_FECHAMENTO_DETALHAMENTO'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'PROJETOS'
CROSS JOIN "Permission" np
WHERE np."code" = 'PROJETOS_SKILLS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'PROJETOS'
CROSS JOIN "Permission" np
WHERE np."code" = 'PROJETOS_APROVACAO'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'PROJETOS_FINANCEIRO'
CROSS JOIN "Permission" np
WHERE np."code" = 'PROJETOS_RECEBIMENTOS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'PROJETOS_FINANCEIRO'
CROSS JOIN "Permission" np
WHERE np."code" = 'PROJETOS_COBRANCA'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CLIENTES'
CROSS JOIN "Permission" np
WHERE np."code" = 'CLIENTES_TIPOS_COBRANCA'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CONSULTORES'
CROSS JOIN "Permission" np
WHERE np."code" = 'PAINEL_TALENTOS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CONSULTORES'
CROSS JOIN "Permission" np
WHERE np."code" = 'PAINEL_TALENTOS_TALENT_FINDER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CONSULTORES'
CROSS JOIN "Permission" np
WHERE np."code" = 'PAINEL_TALENTOS_SKILLS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CONSULTORES'
CROSS JOIN "Permission" np
WHERE np."code" = 'PAINEL_TALENTOS_CERTIFICACOES'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CONSULTORES'
CROSS JOIN "Permission" np
WHERE np."code" = 'PAINEL_TALENTOS_CONSULTORES'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CONSULTORES'
CROSS JOIN "Permission" np
WHERE np."code" = 'PAINEL_TALENTOS_MATRIZ_SKILLS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CONSULTORES'
CROSS JOIN "Permission" np
WHERE np."code" = 'PAINEL_TALENTOS_INATIVOS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'CONSULTORES'
CROSS JOIN "Permission" np
WHERE np."code" = 'PAINEL_TALENTOS_GOVERNANCA'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'SKILLS'
CROSS JOIN "Permission" np
WHERE np."code" = 'SKILLS_CURRICULO'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'SKILLS'
CROSS JOIN "Permission" np
WHERE np."code" = 'SKILLS_CATALOGO'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'COE'
CROSS JOIN "Permission" np
WHERE np."code" = 'COE_COMPOSICAO'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'COE'
CROSS JOIN "Permission" np
WHERE np."code" = 'COE_PROPOSTAS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'COE'
CROSS JOIN "Permission" np
WHERE np."code" = 'COE_CURADORIA'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'RELATORIOS'
CROSS JOIN "Permission" np
WHERE np."code" = 'RELATORIOS_DESPESAS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'RELATORIOS'
CROSS JOIN "Permission" np
WHERE np."code" = 'RELATORIOS_CONSOLIDADO'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'FINANCEIRO'
CROSS JOIN "Permission" np
WHERE np."code" = 'FINANCEIRO_CONTAS_RECEBER'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'FINANCEIRO'
CROSS JOIN "Permission" np
WHERE np."code" = 'FINANCEIRO_CONTAS_PAGAR'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 4b. Telas antes role-gated: os mesmos papéis do gate de rota
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN', 'CONSULTANT', 'AREA_MANAGER', 'FINANCE') AND np."code" = 'MINHAS_NOTAS'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN', 'AREA_MANAGER', 'FINANCE', 'PEOPLE') AND np."code" = 'DESPESAS_POLITICA'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN', 'AREA_MANAGER', 'PROJECT_MANAGER') AND np."code" = 'OPERACAO_COCKPIT'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN', 'AREA_MANAGER', 'FINANCE') AND np."code" = 'FINANCEIRO_STATUS_FATURAMENTO'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, true, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN') AND np."code" = 'CONFIGURACOES_MENU'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

-- 4c. Codes nativos inertes que passam a ser checados: = células da tela pai
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'HORAS'
CROSS JOIN "Permission" np
WHERE np."code" = 'HORAS_LANCAMENTOS'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET
  "canView" = EXCLUDED."canView", "canCreate" = EXCLUDED."canCreate",
  "canEdit" = EXCLUDED."canEdit", "canDelete" = EXCLUDED."canDelete", "updatedAt" = NOW();
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'RELATORIOS'
CROSS JOIN "Permission" np
WHERE np."code" = 'HORAS_RELATORIOS'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET
  "canView" = EXCLUDED."canView", "canCreate" = EXCLUDED."canCreate",
  "canEdit" = EXCLUDED."canEdit", "canDelete" = EXCLUDED."canDelete", "updatedAt" = NOW();
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'PROJETOS'
CROSS JOIN "Permission" np
WHERE np."code" = 'PROJETOS_EQUIPES'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET
  "canView" = EXCLUDED."canView", "canCreate" = EXCLUDED."canCreate",
  "canEdit" = EXCLUDED."canEdit", "canDelete" = EXCLUDED."canDelete", "updatedAt" = NOW();
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT rp."roleId", np."id", rp."canView", rp."canCreate", rp."canEdit", rp."canDelete", NOW()
FROM "RolePermission" rp
JOIN "Permission" sp ON sp."id" = rp."permissionId" AND sp."code" = 'PROJETOS'
CROSS JOIN "Permission" np
WHERE np."code" = 'PROJETOS_RELATORIOS'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET
  "canView" = EXCLUDED."canView", "canCreate" = EXCLUDED."canCreate",
  "canEdit" = EXCLUDED."canEdit", "canDelete" = EXCLUDED."canDelete", "updatedAt" = NOW();


-- 4d. Abas financeiras novas do detalhe de Projetos: os mesmos papéis que as
--     viam pelo gate de papel (Recebimentos = SALE_RATE ∪ FINANCIAL; Cobrança
--     = FINANCIAL), somados à cópia de PROJETOS_FINANCEIRO feita no 4a.
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN', 'AREA_MANAGER', 'FINANCE', 'SALES') AND np."code" = 'PROJETOS_RECEBIMENTOS'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "canView" = true, "updatedAt" = NOW();
INSERT INTO "RolePermission" ("roleId", "permissionId", "canView", "canCreate", "canEdit", "canDelete", "updatedAt")
SELECT r."id", np."id", true, false, false, false, NOW()
FROM "Role" r CROSS JOIN "Permission" np
WHERE r."key" IN ('ADMIN', 'AREA_MANAGER', 'FINANCE') AND np."code" = 'PROJETOS_COBRANCA'
ON CONFLICT ("roleId", "permissionId") DO UPDATE SET "canView" = true, "updatedAt" = NOW();
