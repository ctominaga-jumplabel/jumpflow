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
