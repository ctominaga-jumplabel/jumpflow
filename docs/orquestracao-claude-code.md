# Orquestracao Claude Code - JumpFlow

## 1. Objetivo

Este guia descreve como iniciar e conduzir o desenvolvimento do JumpFlow usando Claude Code, agentes especializados e workflows sob demanda.

## 2. Antes de Implementar

Para toda historia relevante:

1. Ler `docs/backlog-mvp.md`.
2. Confirmar a historia e criterios de aceite.
3. Verificar impacto em `docs/modelo-dados.md`.
4. Verificar arquitetura em `docs/arquitetura.md`.
5. Verificar design system em `docs/design-system.md`, se houver UI.
6. Verificar identidade visual em `docs/identidade-visual-playful-ops.md`, se houver mudanca de linguagem visual.
7. Escolher os agentes adequados.

## 3. Prompt Base para Claude Code

```text
Leia CLAUDE.md e os documentos fonte em docs/.
Use os agentes do projeto quando fizer sentido.
Implemente a historia [ID] do backlog MVP.
Mantenha a solucao alinhada com Next.js, Prisma, Supabase Postgres e Vercel.
Antes de finalizar, rode validacoes possiveis e use jump-code-reviewer para revisar riscos.
```

## 4. Fluxo por Historia

### Produto

```text
Use o agente jump-product-owner para refinar a historia [ID], confirmar criterios de aceite e apontar decisoes pendentes.
```

### Dados

```text
Use o agente jump-data-modeler para propor alteracoes de schema Prisma necessarias para a historia [ID], respeitando docs/modelo-dados.md.
```

### Arquitetura

```text
Use o agente jump-architect para revisar impacto tecnico da historia [ID] e confirmar que a solucao continua migravel de Supabase/Vercel para Render/Postgres.
```

### Implementacao

```text
Use o agente jump-fullstack-engineer para implementar a historia [ID] de ponta a ponta.
```

### Automacao

```text
Use o agente jump-workflow-automation para definir motores de regra, jobs agendados, notificacoes, emails, planilhas, idempotencia e logs operacionais da historia [ID].
```

### UX

```text
Use o agente jump-frontend-ux para revisar e melhorar a experiencia da tela/fluxo da historia [ID].
```

### Design System

```text
Use o agente jump-design-system para auditar identidade visual, Motion, componentes 21st.dev e acabamento premium da historia [ID].
```

### Identidade Visual

```text
Use o agente jump-visual-identity para refinar a direcao Playful Ops, avaliar Neo Brutalism controlado, decidir uso de Three.js/assets e indicar onde a interface deve ser mais divertida ou mais operacional.
```

### QA

```text
Use o agente jump-qa-engineer para criar cenarios de teste para a historia [ID], incluindo casos negativos.
```

### Revisao

```text
Use o agente jump-code-reviewer para revisar as alteracoes, priorizando bugs, permissoes, dados financeiros e testes faltantes.
```

## 5. Quando Usar Ultracode / Dynamic Workflows

Use para:

- auditoria ampla de arquitetura;
- revisao de seguranca e permissoes;
- revisao pre-release;
- busca de inconsistencias entre documentos e codigo;
- migracoes grandes;
- bugs espalhados por varios modulos.

Nao usar como padrao para tarefas pequenas e localizadas.

## 6. Primeira Sequencia Recomendada

1. Criar base Next.js e monorepo.
2. Configurar Prisma e schema inicial.
3. Configurar autenticacao.
4. Implementar usuarios e roles.
5. Implementar consultores.
6. Implementar clientes.
7. Implementar projetos.
8. Implementar alocacoes.
9. Implementar lancamento semanal de horas.
10. Implementar aprovacao/reprovacao.
