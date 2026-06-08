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
2. `jump-architect` valida impacto arquitetural, se necessario.
3. `jump-data-modeler` valida schema, se houver dados novos.
4. `jump-fullstack-engineer` implementa.
5. `jump-frontend-ux` melhora a experiencia, se houver tela.
6. `jump-qa-engineer` cria ou ajusta testes.
7. `jump-code-reviewer` revisa antes de finalizar.

### Nova Tela

1. `jump-product-owner` confirma objetivo e persona.
2. `jump-frontend-ux` desenha fluxo e implementa UI.
3. `jump-fullstack-engineer` conecta dados e regras.
4. `jump-qa-engineer` valida fluxo.
5. `jump-code-reviewer` revisa.

### Mudanca no Banco

1. `jump-data-modeler` propõe alteracao.
2. `jump-architect` valida impacto, se for estrutural.
3. `jump-fullstack-engineer` aplica no codigo.
4. `jump-qa-engineer` cobre regras afetadas.
5. `jump-code-reviewer` revisa.

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
- O `jump-devops` deve ser chamado antes de qualquer mudanca em deploy, ambiente ou secrets.
- O `jump-data-modeler` deve ser chamado antes de alterar schema Prisma.
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
- Agentes: `.claude/agents/`

