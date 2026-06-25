# Agentes Claude Code - Plataforma Jump

## 1. Objetivo

Este documento define como usar os agentes do projeto para construir a Plataforma Jump com coordenacao, foco e pouca duplicidade de trabalho.

Os subagentes do Claude Code foram criados em:

```text
.claude/agents/
```

## 2. Agentes Criados

### `jump-product-owner`

Use para:

- transformar ideias em backlog;
- escrever historias;
- refinar criterios de aceite;
- separar MVP de fases futuras;
- revisar valor de produto.

Arquivos principais:

- `docs/plataforma-jump-horas.md`
- `docs/backlog-mvp.md`

### `jump-architect`

Use para:

- decisoes tecnicas;
- modularizacao;
- ADRs;
- trade-offs;
- migracao Vercel/Supabase para Render/Postgres.

Arquivos principais:

- `docs/arquitetura.md`
- `docs/modelo-dados.md`

### `jump-data-modeler`

Use para:

- schema Prisma;
- relacionamentos;
- constraints;
- migrations;
- regras de dados;
- relatorios e fechamento.

Arquivos principais:

- `docs/modelo-dados.md`
- `packages/database/`, quando existir.

### `jump-fullstack-engineer`

Use para:

- implementar historias;
- criar Server Actions;
- criar Route Handlers;
- integrar Prisma;
- implementar regras de negocio;
- conectar UI e dados.

Arquivos principais:

- `apps/web/`, quando existir.
- `packages/shared/`, quando existir.
- `packages/database/`, quando existir.

### `jump-workflow-automation`

Use para:

- motores de regras;
- aprovacoes automaticas;
- jobs agendados;
- notificacoes e emails;
- geracao de planilhas/CSV;
- idempotencia, retries e logs operacionais.

Arquivos principais:

- `apps/web/`, para Route Handlers, Server Actions e jobs no MVP.
- `packages/database/`, quando houver estados, logs ou configuracoes persistidas.
- `docs/modelo-dados.md`
- `docs/arquitetura.md`

### `jump-timesheet-agent`

Use para:

- lancamento de horas;
- periodos semanais;
- envio para aprovacao;
- regras de edicao/bloqueio;
- integracao com aprovacao automatica.

Arquivos principais:

- `docs/backlog-refinado-consultor-operacoes.md`
- `docs/backlog-mvp.md`
- `docs/aprovacao-automatica.md`
- `apps/web/src/components/timesheet/`
- `apps/web/src/lib/mock-data/timesheet.ts`

### `jump-expenses-agent`

Use para:

- despesas;
- comprovantes;
- aprovacao de despesas;
- status de pagamento;
- relatorios de despesas;
- integracao com financeiro.

Arquivos principais:

- `docs/backlog-refinado-consultor-operacoes.md`
- `apps/web/src/app/app/despesas/`, quando existir.
- `apps/web/src/components/expenses/`, quando existir.
- `packages/database/prisma/schema.prisma`, quando houver persistencia.

### `jump-finance-ops-agent`

Use para:

- cobranca e remuneracao;
- valor hora por alocacao com vigencia;
- relatorios financeiros;
- faturamento, contas a receber/pagar e fechamento;
- margem, exportacoes e RBAC financeiro.

Arquivos principais:

- `docs/plano-implementacao-proximas-funcionalidades.md`
- `docs/relatorios-fechamento.md`
- `docs/modelo-dados.md`
- `packages/database/prisma/schema.prisma`
- `apps/web/src/app/app/financeiro/`
- `apps/web/src/lib/reports/`, quando existir.

### `jump-billing-agent`

Use para:

- tipos de cobranca;
- regras de faturamento de cliente;
- valores de venda e vigencia;
- fechamento de receita;
- pre-fatura e status de receita;
- base de dados para emissao fiscal.

Arquivos principais:

- `docs/orchestration/jumpflow-master-plan.md`
- `docs/modelo-dados.md`
- `docs/relatorios-fechamento.md`
- `packages/database/prisma/schema.prisma`
- `apps/web/src/app/app/financeiro/`, quando houver receita/pre-fatura.

### `jump-payments-agent`

Use para:

- pagamento de consultores;
- previsao de pagamento;
- confirmacao de valores;
- NF recebida e validada;
- envio ao banco/ERP;
- abertura por projeto, horas, valores e beneficios.

Arquivos principais:

- `docs/orchestration/jumpflow-master-plan.md`
- `docs/modelo-dados.md`
- `packages/database/prisma/schema.prisma`
- futuros modulos de pagamento de consultores.

### `jump-fiscal-nfse-agent`

Use para:

- NFS-e Sao Paulo;
- Web Service oficial da Prefeitura de Sao Paulo;
- XML, PDF, numero de NF e protocolo;
- ISS, municipio, tipo de NF e regras tributarias;
- documentos fiscais e reprocessamento de emissao.

Arquivos principais:

- `docs/orchestration/jumpflow-master-plan.md`
- `docs/modelo-dados.md`
- `docs/arquitetura.md`
- `packages/database/prisma/schema.prisma`
- futuros providers fiscais.

### `jump-hr-compensation-agent`

Use para:

- tipos de contratacao CLT, PJ e CLT FLEX;
- valores acordados;
- beneficios;
- dados bancarios;
- descontos CLT, FGTS, INSS e parametros de calculo;
- dados sensiveis de remuneracao do consultor.

Arquivos principais:

- `docs/orchestration/jumpflow-master-plan.md`
- `docs/modelo-dados.md`
- `packages/database/prisma/schema.prisma`
- futuros modulos de consultores/remuneracao.

### `jump-integrations-agent`

Use para:

- provider abstraction;
- CNPJ;
- CEP;
- Entra ID;
- Prefeitura SP/NFS-e;
- email;
- storage;
- banco/ERP;
- secrets, retries, timeouts e portabilidade.

Arquivos principais:

- `docs/arquitetura.md`
- `docs/orchestration/jumpflow-master-plan.md`
- arquivos de config/env;
- modulos de providers em `apps/web/src/lib/`, quando existirem.

### `jump-people-ops-agent`

Use para:

- revisao semanal por projeto;
- ocorrencias operacionais;
- calendario de feriados/emendas;
- feedback assincrono;
- offboarding e redistribuicao de assets;
- lifecycle operacional do consultor.

Arquivos principais:

- `docs/plano-implementacao-proximas-funcionalidades.md`
- `docs/ideacao-melhorias-horas-skills.md`
- `docs/backlog-refinado-consultor-operacoes.md`
- `apps/web/src/components/timesheet/`
- futuros modulos `/trocas` e `/admin/desligamentos`.

### `jump-skills-intelligence-agent`

Use para:

- skills reais;
- autosservico do consultor;
- matriz de skills;
- sugestoes assistidas por IA/heuristica;
- curadoria de catalogo;
- validacao por gestor/People.

Arquivos principais:

- `docs/plano-implementacao-proximas-funcionalidades.md`
- `docs/ideacao-melhorias-horas-skills.md`
- `apps/web/src/app/app/skills/`
- `apps/web/src/components/skills/`
- `apps/web/src/lib/skills/`
- `packages/database/prisma/schema.prisma`.

### `jump-nathalia-agent`

Use para:

- a Nathal.IA, companheira de trabalho 2D do JumpFlow;
- niveis de presenca (icone vivo, assistente contextual, guia, celebrar);
- motor proativo e sinais contextuais reais por tela;
- expressoes, visemas, lip-sync e microanimacoes 2D;
- camada de inteligencia local (FAQ/intent/knowledge) e seam de TTS/LLM.

Arquivos principais:

- `packages/character-nathalia/src/`
- `apps/web/src/components/nathalia/`
- `apps/web/src/lib/nathalia/`
- `docs/nathalia/`

### `jump-legacy-portal-analyst`

Use para:

- comparar portal antigo e JumpFlow;
- mapear funcionalidades legadas;
- extrair fluxos, campos e status;
- propor equivalentes modernos;
- identificar gaps.

Arquivos principais:

- `docs/backlog-correcoes-e-modulos-consultor.md`
- `docs/backlog-refinado-consultor-operacoes.md`

### `jump-operational-launcher-agent`

Use para:

- tela inicial por perfil;
- atalhos operacionais;
- badges de pendencia;
- navegacao consultor-first;
- alternativa/complemento ao menu lateral.

Arquivos principais:

- `docs/backlog-refinado-consultor-operacoes.md`
- `apps/web/src/app/app/page.tsx`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/components/app-shell/`

### `jump-frontend-ux`

Use para:

- telas;
- componentes;
- dashboards;
- formularios;
- experiencia de lancamento de horas;
- responsividade e acessibilidade.

Arquivos principais:

- `apps/web/`, quando existir.
- `packages/ui/`, quando existir.

### `jump-design-system`

Use para:

- identidade visual;
- design system;
- tokens;
- uso de Motion;
- avaliacao de componentes 21st.dev;
- acabamento premium;
- auditoria visual.

Arquivos principais:

- `docs/design-system.md`
- `.claude/skills/ui-ux-pro-max/`
- `apps/web/`, quando existir.
- `packages/ui/`, quando existir.

### `jump-visual-identity`

Use para:

- exploracao de identidade visual;
- direcao criativa Playful Ops;
- Neo Brutalism controlado;
- avaliacao de uso de Three.js, Rive, Spline, assets bitmap, CSS ou SVG;
- moodboards textuais;
- decidir onde a interface pode ser mais divertida e onde deve ser mais operacional.

Arquivos principais:

- `docs/identidade-visual-playful-ops.md`
- `docs/design-system.md`
- `apps/web/`, quando existir.

### `jump-qa-engineer`

Use para:

- plano de testes;
- testes unitarios;
- testes de integracao;
- testes Playwright;
- validacao de criterios de aceite;
- cenarios negativos.

Arquivos principais:

- `docs/backlog-mvp.md`
- arquivos de teste, quando existirem.

### `jump-devops`

Use para:

- Vercel;
- Supabase;
- Render;
- variaveis de ambiente;
- CI/CD;
- ambientes;
- observabilidade.

Arquivos principais:

- `docs/arquitetura.md`
- arquivos de configuracao e deploy.

### `jump-code-reviewer`

Use para:

- revisar alteracoes;
- encontrar bugs;
- detectar risco de permissao;
- revisar regras financeiras;
- apontar testes faltantes;
- validar qualidade antes de merge.

Arquivos principais:

- Qualquer arquivo alterado.

## 3. Fluxo Recomendado por Tipo de Trabalho

### Nova Funcionalidade

1. `jump-product-owner` refina historia e criterios.
2. Use o agente especialista de dominio, quando houver: `jump-timesheet-agent`, `jump-expenses-agent`, `jump-operational-launcher-agent`, `jump-workflow-automation` ou outro.
3. `jump-architect` valida impacto arquitetural, se necessario.
4. `jump-data-modeler` valida schema, se houver dados novos.
5. `jump-fullstack-engineer` implementa.
6. `jump-frontend-ux` melhora a experiencia, se houver tela.
7. `jump-qa-engineer` cria ou ajusta testes.
8. `jump-code-reviewer` revisa antes de finalizar.

### Horas, Despesas e Launcher

1. `jump-product-owner` confirma escopo e ordem de entrega.
2. `jump-legacy-portal-analyst` compara com o portal antigo quando necessario.
3. `jump-timesheet-agent` define regras de horas.
4. `jump-expenses-agent` define regras de despesas.
5. `jump-operational-launcher-agent` define atalhos e badges.
6. `jump-architect` valida RBAC, rotas e persistencia.
7. `jump-fullstack-engineer` implementa.
8. `jump-frontend-ux` refina fluxos e responsividade.
9. `jump-design-system` revisa consistencia visual.
10. `jump-qa-engineer` cobre testes.
11. `jump-code-reviewer` revisa.

### Roadmap Pos-MVP / Proximas Funcionalidades

1. `jump-product-owner` confirma fase, valor e fora de escopo.
2. Escolha o agente de dominio:
   - Horas/revisao semanal/ocorrencias/calendario/offboarding/feedback:
     `jump-people-ops-agent` + `jump-timesheet-agent`.
   - Financeiro amplo/governanca/margem/exportacoes:
     `jump-finance-ops-agent`.
   - Receita, tipos de cobranca, pre-fatura e fechamento de cliente:
     `jump-billing-agent`.
   - Pagamento de consultores, previsoes, NF recebida e envio ao banco:
     `jump-payments-agent`.
   - NFS-e, documentos fiscais, ISS e Prefeitura SP:
     `jump-fiscal-nfse-agent`.
   - Contratacao, beneficios, dados bancarios e descontos CLT:
     `jump-hr-compensation-agent`.
   - CNPJ, CEP, Entra ID, email, storage, banco/ERP e providers:
     `jump-integrations-agent`.
   - Skills reais/curadoria/sugestoes:
     `jump-skills-intelligence-agent`.
3. `jump-data-modeler` valida schema e migracoes.
4. `jump-architect` valida fronteiras de dominio se a mudanca for estrutural.
5. `jump-workflow-automation` entra quando houver jobs, SLA, notificacoes,
   calendario ou idempotencia.
6. `jump-fullstack-engineer` e `jump-frontend-ux` implementam.
7. `jump-qa-engineer` cobre testes.
8. `jump-code-reviewer` revisa riscos antes do fechamento.

### Nova Tela

1. `jump-product-owner` confirma objetivo e persona.
2. `jump-visual-identity` define direcao visual quando houver mudanca de identidade.
3. `jump-frontend-ux` desenha fluxo e implementa UI.
4. `jump-design-system` revisa acabamento visual, movimento e consistencia.
5. `jump-fullstack-engineer` conecta dados e regras.
6. `jump-qa-engineer` valida fluxo.
7. `jump-code-reviewer` revisa.

### Mudanca de Identidade Visual

1. `jump-product-owner` confirma objetivo, publico e limites de escopo.
2. `jump-visual-identity` define direcao criativa e uso de assets/3D.
3. `jump-design-system` converte direcao em tokens, componentes e regras.
4. `jump-frontend-ux` aplica nas telas preservando ergonomia.
5. `jump-fullstack-engineer` ajusta rotas, dependencias e integracao, se necessario.
6. `jump-qa-engineer` valida acessibilidade, responsividade e testes.
7. `jump-code-reviewer` revisa antes de finalizar.

### Mudanca no Banco

1. `jump-data-modeler` propõe alteracao.
2. `jump-architect` valida impacto, se for estrutural.
3. `jump-fullstack-engineer` aplica no codigo.
4. `jump-qa-engineer` cobre regras afetadas.
5. `jump-code-reviewer` revisa.

### Automacao, Jobs e Notificacoes

1. `jump-product-owner` confirma regra de negocio, destinatarios e excecoes.
2. `jump-workflow-automation` define motor de regras, agenda, idempotencia e logs.
3. `jump-data-modeler` modela configuracoes, execucoes e auditoria, se necessario.
4. `jump-architect` valida o caminho MVP e a migracao futura para worker/fila.
5. `jump-fullstack-engineer` implementa servicos, jobs e integracoes.
6. `jump-qa-engineer` cobre cenarios positivos, negativos e reprocessamento.
7. `jump-code-reviewer` revisa riscos antes de finalizar.

### Deploy ou Ambiente

1. `jump-devops` define configuracao.
2. `jump-architect` valida impacto, se houver mudanca de arquitetura.
3. `jump-fullstack-engineer` ajusta app, se necessario.
4. `jump-code-reviewer` revisa configuracoes sensiveis.

### Revisao de Escopo

1. `jump-product-owner` revisa valor, prioridade e fase.
2. `jump-architect` aponta impacto tecnico.
3. `jump-qa-engineer` aponta impacto de validacao.

## 4. Regras de Orquestracao

- O agente principal deve manter a visao geral e nao delegar tudo automaticamente.
- Use agentes especializados quando houver um recorte claro de responsabilidade.
- Para tarefas pequenas, um unico agente pode resolver.
- Para tarefas grandes, divida em produto, dados, implementacao, testes e revisao.
- O `jump-code-reviewer` deve ser usado no final de mudancas relevantes.
- O `jump-design-system` deve ser usado antes de finalizar telas importantes.
- O `jump-visual-identity` deve ser usado antes de mudancas grandes de linguagem visual, uso de 3D/assets ou exploracao criativa.
- O `jump-devops` deve ser chamado antes de qualquer mudanca em deploy, ambiente ou secrets.
- O `jump-data-modeler` deve ser chamado antes de alterar schema Prisma.
- O `jump-workflow-automation` deve ser chamado antes de criar aprovacoes automaticas, jobs, notificacoes ou emails.
- O `jump-timesheet-agent` deve ser chamado antes de mudancas no modulo Horas.
- O `jump-expenses-agent` deve ser chamado antes de criar ou alterar despesas.
- O `jump-finance-ops-agent` deve ser chamado antes de alteracoes em cobranca,
  remuneracao, valor hora, fechamento, margem ou relatorios financeiros.
- O `jump-billing-agent` deve ser chamado antes de tipos de cobranca,
  pre-fatura, fechamento de receita, valores de venda e regras de faturamento.
- O `jump-payments-agent` deve ser chamado antes de pagamentos de consultores,
  previsoes de pagamento, NF recebida/validada e status de pagamento.
- O `jump-fiscal-nfse-agent` deve ser chamado antes de NFS-e, documentos
  fiscais, XML/PDF, numero de NF, protocolo, ISS ou Prefeitura SP.
- O `jump-hr-compensation-agent` deve ser chamado antes de contratacao,
  beneficios, dados bancarios, valores acordados ou descontos CLT.
- O `jump-integrations-agent` deve ser chamado antes de CNPJ, CEP, Entra ID,
  Prefeitura SP, email, storage, banco/ERP ou qualquer provider externo.
- O `jump-people-ops-agent` deve ser chamado antes de revisao semanal,
  ocorrencias, calendario, feedback assincrono ou offboarding.
- O `jump-skills-intelligence-agent` deve ser chamado antes de mudancas em
  skills reais, sugestoes, catalogo ou validacao de competencias.
- O `jump-nathalia-agent` deve ser chamado antes de mudancas na Nathal.IA: niveis de presenca, motor proativo/sinais, expressoes/visemas, microanimacoes ou a camada de inteligencia em `packages/character-nathalia`.
- O `jump-legacy-portal-analyst` deve ser chamado quando a tarefa envolver comparacao com o portal antigo.
- O `jump-operational-launcher-agent` deve ser chamado antes de alterar `/app` como tela inicial ou atalhos por perfil.
- O `jump-product-owner` deve ser chamado quando houver duvida de escopo.

## 5. Ordem Inicial de Construcao

1. Criar monorepo e aplicacao Next.js.
2. Configurar TypeScript, lint, formatacao e estrutura base.
3. Configurar Prisma e conexao com Supabase.
4. Implementar autenticacao.
5. Criar entidades base: usuarios, roles, consultores, clientes e projetos.
6. Criar alocacoes.
7. Criar lancamento semanal de horas.
8. Criar aprovacao/reprovacao.
9. Criar skills e certificados.
10. Criar dashboards e relatorio mensal.

## 6. Fontes de Verdade

- Produto: `docs/plataforma-jump-horas.md`
- Backlog: `docs/backlog-mvp.md`
- Dados: `docs/modelo-dados.md`
- Arquitetura: `docs/arquitetura.md`
- Design system: `docs/design-system.md`
- Identidade visual: `docs/identidade-visual-playful-ops.md`
- Backlog refinado: `docs/backlog-refinado-consultor-operacoes.md`
- Agentes: `.claude/agents/`
