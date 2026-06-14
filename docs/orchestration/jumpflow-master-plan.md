# JumpFlow Master Plan - Orquestracao Faseada

Data da auditoria: 2026-06-13
Executor: Codex CLI como avaliador/orquestrador externo
Escopo desta versao: Fase 0 - auditoria inicial e plano. Nenhum codigo de produto foi implementado.

## 1. Diagnostico do Projeto Atual

### Estado tecnico

- Monorepo npm com `apps/web`, `packages/database`, `packages/shared` e `packages/ui`.
- App principal em Next.js 16, React 19, TypeScript, Tailwind CSS, Auth.js v5, Prisma e PostgreSQL.
- Scripts raiz disponiveis: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, alem de comandos Prisma.
- Auth atual: Microsoft Entra ID preparado via Auth.js, dev mode local explicito e convites/credenciais locais para desenvolvimento. Regras de negocio permanecem desacopladas do provedor.
- RBAC centralizado em `apps/web/src/lib/auth`, com guards de rota e roles principais: ADMIN, CONSULTANT, PROJECT_MANAGER, AREA_MANAGER, FINANCE, PEOPLE e SALES.
- Persistencia Prisma ja cobre usuarios, roles, convites, consultores, clientes, projetos, alocacoes, horas, aprovacoes, skills, sugestoes de skill, certificados, despesas, anexos, automacoes, relatorios e auditoria.
- Automacoes existentes: aprovacao automatica de horas, relatorio de consultores sem lancamento, Vercel cron e transporte de email console/Resend.
- UI atual possui shell operacional, dashboard, launcher, horas, aprovacoes, despesas, relatorios, financeiro, consultores, projetos, skills e certificados.

### Estado funcional

- Horas ja tem persistencia e Server Actions, com pendencias de evolucao para filtros completos, periodo arbitrario, calendario, totais e lancamento diario/semanal conforme solicitado.
- Aprovacoes existem, mas precisam evoluir para filtros combinados, selecao em massa, detalhe de lancamento e auditoria completa por operacao.
- Despesas existem com modelo persistente, anexos e storage abstraido, mas a proxima fase deve reforcar anexo obrigatorio, download e preview em tela.
- Clientes, projetos, consultores, skills e financeiro ainda precisam sair de MVP/base para cadastros e fluxos completos.
- Financeiro atual e orientado a relatorios/fechamento MVP; ainda nao cobre pre-fatura, NFS-e Sao Paulo, documentos fiscais, protocolo, XML/PDF, pagamento de consultores ou previsoes.

### Worktree observado

Durante a auditoria havia alteracoes pre-existentes em:

- `CLAUDE.md`
- `docs/agentes.md`
- `docs/orquestracao-claude-code.md`
- `packages/database/prisma/schema.prisma`
- telas e libs de horas/skills em `apps/web`
- novos agentes em `.claude/agents/jump-finance-ops-agent.md`, `jump-people-ops-agent.md` e `jump-skills-intelligence-agent.md`
- novas migracoes de defaults de horas e sugestoes de skills

Decisao da Fase 0: nao sobrescrever essas alteracoes. Esta fase adiciona apenas arquivos novos em `docs/orchestration/`.

## 2. Diagnostico dos Agentes Existentes

### Agentes mantidos

- `jump-product-owner`: bom para escopo, historias, criterios e priorizacao.
- `jump-architect`: bom para decisoes tecnicas, migrabilidade e ADRs.
- `jump-data-modeler`: obrigatorio antes de alteracoes Prisma/dados.
- `jump-fullstack-engineer`: implementacao Next.js, Prisma, Server Actions e Route Handlers.
- `jump-workflow-automation`: automacoes, emails, jobs, idempotencia e logs.
- `jump-timesheet-agent`: especialista de horas.
- `jump-expenses-agent`: especialista de despesas.
- `jump-frontend-ux`: experiencia, telas, componentes e acessibilidade.
- `jump-design-system`: Playful Ops, tokens, consistencia visual e Motion.
- `jump-visual-identity`: direcao criativa quando houver mudanca visual ampla.
- `jump-qa-engineer`: estrategia e cenarios de teste.
- `jump-devops`: Vercel, Supabase, Render, env vars e observabilidade.
- `jump-code-reviewer`: revisao final de mudancas relevantes.
- `jump-legacy-portal-analyst`: comparacao com portal antigo.
- `jump-operational-launcher-agent`: launcher, atalhos e badges.

### Agentes recentes a manter e refinar

- `jump-finance-ops-agent`: cobre cobranca, remuneracao, fechamento, margem, exportacoes e RBAC financeiro. Deve ser mantido, mas precisa separar explicitamente Receita, Pagamento de Consultores e Fiscal/NFS-e.
- `jump-people-ops-agent`: cobre lifecycle operacional, ocorrencias, calendario, feedback e offboarding. Deve ser mantido e conectado ao cadastro completo de consultores.
- `jump-skills-intelligence-agent`: cobre skills reais, sugestoes assistidas, catalogo e validacao humana. Deve ser mantido e refinado para o fluxo "Aguardando Confirmacao".

### Lacunas de agentes

Os seguintes agentes devem ser criados ou extraidos para reduzir risco nas fases financeiras e de integracao:

- `jump-billing-agent`: receita, tipos de cobranca, pre-fatura, fechamento por cliente/projeto e regras de faturamento.
- `jump-payments-agent`: pagamento de consultores, previsao de pagamento, confirmacao, abertura por projeto, beneficios e status bancarios.
- `jump-fiscal-nfse-agent`: NFS-e Sao Paulo, XML/PDF, numero, protocolo, regras fiscais, ISS, municipio, tipo de NF e integracao oficial.
- `jump-hr-compensation-agent`: CLT, PJ, CLT FLEX, contas bancarias, beneficios, descontos CLT, FGTS/INSS e regras de compensacao.
- `jump-integrations-agent`: CNPJ, CEP, Entra ID, prefeitura, email, banco/ERP e provider abstractions.

## 3. Principios de Orquestracao

- Uma fase pequena por rodada de Claude Code.
- Cada rodada deve carregar apenas `CLAUDE.md`, `docs/orchestration/jumpflow-execution-state.md`, docs diretamente relacionadas e arquivos afetados.
- Antes de schema Prisma: usar/raciocinar como `jump-data-modeler`.
- Antes de horas: `jump-timesheet-agent`.
- Antes de despesas: `jump-expenses-agent`.
- Antes de automacoes, emails, jobs, NF, pagamentos ou integracoes: `jump-workflow-automation` e o agente de dominio correspondente.
- Antes de telas importantes: `jump-frontend-ux` e `jump-design-system`.
- Antes de finalizar mudancas relevantes: `jump-code-reviewer`.
- Campos financeiros devem ter RBAC e testes negativos.
- Mudancas sensiveis devem gerar `AuditEvent`.
- Integracoes externas devem usar provider abstraction; nao hardcodar provedor em regra de negocio.
- Nao usar dados mockados onde ja houver persistencia necessaria para fluxo real.
- Nao remover funcionalidades existentes sem justificativa documentada.

## 4. Roadmap Faseado

### Fase 0 - Auditoria inicial e plano

Objetivo: mapear arquitetura, agentes, gaps e criar documentos de orquestracao.

Entregas:

- `docs/orchestration/jumpflow-master-plan.md`
- `docs/orchestration/jumpflow-execution-state.md`

Aceite:

- Diagnostico do projeto atual registrado.
- Diagnostico de agentes registrado.
- Fases, criterios, validacoes e comando de continuidade definidos.

### Fase 1 - Refinamento dos agentes

Objetivo: ajustar documentacao e criar agentes faltantes.

Entregas:

- Criar: `jump-billing-agent`, `jump-payments-agent`, `jump-fiscal-nfse-agent`, `jump-hr-compensation-agent`, `jump-integrations-agent`.
- Refinar `jump-finance-ops-agent`, se necessario, para encaminhar trabalhos especializados.
- Atualizar `docs/agentes.md`, `CLAUDE.md` e `docs/orquestracao-claude-code.md` com o fluxo faseado e os novos agentes.

Aceite:

- Todos os agentes citados possuem `.claude/agents/*.md`.
- Docs indicam quando chamar cada agente.
- Nenhuma regra financeira/fiscal fica sem dono claro.

Validacao:

- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

### Fase 2 - Modelo de dados base expandido

Objetivo: preparar schema/documentacao para clientes, tipos de cobranca, projetos, valores de venda, consultores, contratacao, beneficios, despesas/anexos, financeiro receita, pagamento, auditoria e documentos fiscais.

Agentes: `jump-data-modeler`, `jump-architect`, `jump-billing-agent`, `jump-payments-agent`, `jump-fiscal-nfse-agent`, `jump-hr-compensation-agent`, `jump-integrations-agent`, `jump-code-reviewer`.

Aceite:

- Prisma e docs modelam as entidades novas com constraints e indices relevantes.
- Campos financeiros e pessoais sensiveis tem regra de visibilidade documentada.
- Auditoria definida para alteracoes sensiveis.
- Migrations pequenas, nomeadas e revisaveis.

### Fase 3 - Horas

Objetivo: filtros, periodo arbitrario, calendario, totais, lancamento diario/semanal e regras de edicao por status.

Agentes: `jump-timesheet-agent`, `jump-frontend-ux`, `jump-design-system`, `jump-fullstack-engineer`, `jump-qa-engineer`, `jump-code-reviewer`.

Aceite:

- Filtros por status, projeto e atividade combinaveis.
- Periodo com data inicio/fim e totais.
- Calendario adapta mes/semanas/semana conforme tamanho do periodo.
- Cores e legenda por status.
- Lancamento semanal gera entradas dia a dia com descricao replicada.
- Edicao de `SUBMITTED` respeita permissao/reabertura.

### Fase 4 - Aprovacoes

Objetivo: filtros combinados, massa, detalhe e auditoria.

Aceite:

- Filtros por periodo, status, projeto, consultor e atividade.
- Selecao e alteracao em massa.
- Detalhe de lancamento acessivel.
- Auditoria por decisao individual e em massa.

### Fase 5 - Despesas

Objetivo: anexo obrigatorio, download, preview e auditoria.

Aceite:

- Criar/enviar despesa exige anexo.
- Download e preview em tela respeitam RBAC.
- Storage segue abstraction existente.
- Acoes sensiveis geram auditoria.

### Fase 6 - Clientes e tipos de cobranca

Objetivo: cadastro completo de clientes, tipos de cobranca e provider CNPJ.

Aceite:

- Cliente tem nome, logo, CNPJ, billing fields, fiscal fields e status.
- Subtela de tipos de cobranca.
- Busca CNPJ via provider abstraction.
- Campos financeiros protegidos.

### Fase 7 - Projetos e valores de venda

Objetivo: projetos reais, vinculo cliente/consultores, skill por projeto e valores de venda com vigencia.

Aceite:

- Projeto CRUD com datas, cliente, consultores e skill do vinculo.
- Comercial cadastra valores de venda com inicio/fim.
- Permite mais de um valor por periodo quando a regra exigir, sem sobreposicao invalida.
- Valores alimentam base de faturamento.

### Fase 8 - Skills

Objetivo: sugestoes por descricao, confirmacao humana e autosservico.

Aceite:

- Skill sugerida nasce como `Aguardando Confirmacao`.
- Mostra descricao/evidencia que originou a sugestao.
- Consultor pode confirmar, rejeitar, editar ou apagar.
- Nenhuma sugestao vira skill final sem acao humana.

### Fase 9 - Consultores, contratacao e beneficios

Objetivo: cadastro completo de consultores, Entra ID, CNPJ, CEP, CLT/PJ/CLT FLEX, bancos, valores e descontos.

Aceite:

- Nome, email e status sincronizaveis do Entra ID sem acoplar regras ao provider.
- CPF/CNPJ/CEP com provider abstraction.
- Dados bancarios por tipo de contratacao.
- CLT FLEX abre conta CLT e PJ.
- Beneficios e descontos calculaveis com auditoria.

### Fase 10 - Financeiro Receita

Objetivo: fechamento, pre-fatura, validacao financeira, NFS-e Sao Paulo e email ao cliente.

Aceite:

- Status: Aberto, Em Revisao, Pronto para fechar, Fechado, Faturado.
- Fluxo: horas aprovadas -> fechamento -> pre-fatura -> validacao -> NFS-e -> XML/PDF/protocolo/numero -> email.
- Provider oficial de NFS-e abstraido.
- Documentos fiscais armazenados com metadados e RBAC.

### Fase 11 - Financeiro Pagamento Consultores

Objetivo: fluxo de pagamento, calculos por tipo, beneficios, emails e previsao/confirmacao.

Aceite:

- Status: Aberto, Aguardando NF, NF Recebida, NF Validada, Aprovada para Pagamento, Enviada ao Banco, Processada, Paga.
- Calculos PJ, CLT e CLT FLEX testados.
- Abertura por projeto e beneficio.
- Email para confirmacao com previsao de pagamento.
- Campos de previsao e confirmacao de pagamento.

### Fase 12 - Previsao de pagamento

Objetivo: cadastro de previsoes por mes e prazo de retorno.

Aceite:

- Filtros e mes de fechamento.
- Adicionar previsao com data/hora limite de retorno e data prevista de pagamento.
- Relacionamento com pagamentos de consultores.

### Fase 13 - Revisao final, testes e hardening

Objetivo: hardening de RBAC, auditoria, campos financeiros, docs e qualidade.

Aceite:

- `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build` passam.
- Regressao dos fluxos criticos revisada.
- Relatorio final documenta pendencias, riscos e proximos passos.

## 5. Validacao Padrao por Fase

Executar, quando disponivel:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Quando a fase tocar Prisma:

```bash
npm run db:generate
```

Quando houver migration:

```bash
npm run db:migrate
```

## 6. Comando/Prompt para Iniciar a Fase 1 em Contexto Limpo

Use este prompt em uma nova sessao do Claude Code/Codex:

```text
Voce esta no repositorio JumpFlow. Execute somente a Fase 1 do plano.

Leia apenas:
- CLAUDE.md
- docs/orchestration/jumpflow-execution-state.md
- docs/orchestration/jumpflow-master-plan.md
- docs/agentes.md
- docs/orquestracao-claude-code.md
- .claude/agents/*

Objetivo da Fase 1:
- Refinar agentes existentes.
- Criar os agentes faltantes: jump-billing-agent, jump-payments-agent, jump-fiscal-nfse-agent, jump-hr-compensation-agent e jump-integrations-agent.
- Atualizar docs/agentes.md, CLAUDE.md e docs/orquestracao-claude-code.md somente no necessario.
- Nao implementar codigo de produto.
- Preservar alteracoes pre-existentes no worktree; nao reverter nada que voce nao criou.
- Ao final, rodar npm run lint, npm run typecheck, npm run test e npm run build se disponiveis.
- Atualizar docs/orchestration/jumpflow-execution-state.md com arquivos alterados, decisoes, pendencias, testes e prompt para Fase 2.
```

Comando sugerido se estiver usando a CLI interativa:

```bash
codex
```

Depois cole o prompt acima.
