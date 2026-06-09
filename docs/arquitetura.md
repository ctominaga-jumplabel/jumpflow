# Arquitetura - Plataforma Jump

## 1. Decisao Arquitetural Inicial

A plataforma sera iniciada como uma aplicacao fullstack em Next.js, publicada na Vercel, com PostgreSQL no Supabase e Prisma como ORM.

Essa decisao privilegia:

- velocidade de desenvolvimento;
- baixo peso local;
- publicacao simples;
- menor custo operacional no MVP;
- possibilidade de migracao futura para Render + PostgreSQL.

## 2. Stack Definitiva do MVP

### Aplicacao

- Next.js.
- React.
- TypeScript.
- App Router.
- Server Actions e/ou Route Handlers para operacoes backend.

### UI

- Tailwind CSS.
- Componentes internos em `packages/ui`, se o monorepo for criado desde o inicio.
- Lucide React para icones.
- React Hook Form.
- Zod.

### Dados

- Supabase Postgres no MVP.
- Prisma ORM.
- Prisma migrations.
- PostgreSQL no Render como destino futuro.

### Autenticacao

Opcao preferencial a validar:

- Microsoft Entra ID se a Jump usar Microsoft 365.

Alternativas:

- Auth.js.
- Clerk.
- Supabase Auth.

Decisao provisoria:

- Manter autenticacao desacoplada da regra de negocio.
- Evitar acoplar permissoes exclusivamente ao provedor de auth.

### Deploy

- Vercel para frontend e backend serverless do MVP.
- GitHub como origem do deploy.
- Render futuro para API separada, workers e PostgreSQL.

### Qualidade

- ESLint.
- Prettier.
- Vitest.
- Testing Library.
- Playwright para fluxos criticos.

## 3. Estrutura de Repositorio

Recomendacao: monorepo.

```text
PlatHoras/
  apps/
    web/
  packages/
    database/
    shared/
    ui/
  docs/
  .claude/
    agents/
```

### `apps/web`

Aplicacao Next.js principal.

Responsavel por:

- telas;
- rotas privadas;
- dashboards;
- formularios;
- rotas de API;
- Server Actions;
- integracao com auth;
- chamada ao Prisma.

### `packages/database`

Camada de dados.

Responsavel por:

- schema Prisma;
- migrations;
- client Prisma;
- seeds;
- helpers de banco.

### `packages/shared`

Contratos e utilitarios compartilhados.

Responsavel por:

- enums;
- schemas Zod;
- tipos de dominio;
- regras compartilhadas sem dependencia de UI.

### `packages/ui`

Biblioteca visual interna, quando fizer sentido.

Responsavel por:

- botoes;
- inputs;
- tabelas;
- dialogs;
- layout;
- componentes de dashboard.

## 4. Modulos Funcionais

### Auth e Permissoes

- Sessao do usuario.
- Papeis.
- Guards de acesso.
- Helpers de autorizacao.

### Consultores

- Cadastro.
- Status.
- Senioridade.
- Dados profissionais.

### Clientes

- Cadastro.
- Status.
- Vinculo com projetos.

### Projetos

- Cadastro.
- Gestor responsavel.
- Budget.
- Valor hora.
- Status.

### Alocacoes

- Consultor.
- Projeto.
- Periodo.
- Percentual.
- Papel.
- Validacao de conflito.

### Horas

- Periodo semanal.
- Lancamentos.
- Envio para aprovacao.
- Status.

### Aprovacoes

- Aprovacao de horas.
- Reprovacao com comentario.
- Historico.

### Skills

- Catalogo.
- Skills do consultor.
- Validacao.
- Busca.

### Certificados

- Cadastro.
- Anexos.
- Vencimento.
- Validacao.

### Financeiro

- Relatorio mensal.
- Horas aprovadas.
- Valor hora.
- Fechamento.

### Auditoria

- Eventos de alteracao sensivel.
- Alteracoes financeiras.
- Aprovacoes.
- Fechamentos.

## 5. Padroes Tecnicos

### Validacao

- Validar entradas com Zod.
- Reutilizar schemas entre formulario e servidor quando possivel.
- Validacao de permissao deve ocorrer sempre no servidor.

### Acesso a Dados

- Prisma como unica camada direta de acesso ao banco.
- Queries sensiveis encapsuladas em funcoes de dominio.
- Evitar SQL cru no MVP, salvo necessidade clara.

### Permissoes

- RBAC no MVP.
- Permissoes checadas por modulo e acao.
- Campos financeiros protegidos.

### Auditoria

- Registrar alteracoes em:
  - valor hora;
  - custo hora;
  - alocacoes;
  - aprovacoes;
  - fechamentos;
  - permissoes.

### Erros

- Erros de negocio devem retornar mensagens claras.
- Erros internos devem ser registrados e nao expor detalhes tecnicos.

## 6. Migracao Planejada para Render + PostgreSQL

### Quando Migrar

- Necessidade de jobs persistentes.
- Crescimento de integracoes.
- APIs com tempo maior de execucao.
- Necessidade de workers.
- Maior controle de infraestrutura.
- Reducao de dependencia de serverless.

### Como Preparar

- Manter migrations Prisma.
- Evitar usar Supabase como camada obrigatoria de regra.
- Documentar variaveis de ambiente.
- Manter separacao entre dominio e infraestrutura.
- Criar scripts de exportacao/importacao quando a migracao se aproximar.

## 7. Decisoes Tecnicas Registradas

- ADR00: Nome inicial do produto sera JumpFlow, mantido facil de alterar por configuracao.
- ADR01: MVP sera fullstack Next.js.
- ADR02: Deploy inicial sera Vercel.
- ADR03: Banco inicial sera Supabase Postgres.
- ADR04: ORM sera Prisma.
- ADR05: Docker nao sera requisito local no MVP.
- ADR06: Render + PostgreSQL sera destino futuro planejado.
- ADR07: Agentes Claude Code serao definidos em `.claude/agents/`.
- ADR08: Jobs de automacao (aprovacao automatica, relatorios) serao Route Handlers cron-friendly no MVP (`/api/jobs/*`), sem fila/worker. Gatilho de migracao: volume/timeout/integracoes (secao 6).
- ADR09: Idempotencia por transicao de status atomica (`updateMany where status=SUBMITTED`) + `AutomationEmailLog @@unique(type, referenceKey)`. Sem fila exactly-once no MVP.
- ADR10: Aprovacao automatica e registrada como `Approval` de sistema auditavel (`approverUserId` nullable + FK SetNull, `isAutomatic`, `ruleKey`) + `AuditEvent` (actor null) na mesma transacao. Casos inconclusivos permanecem `SUBMITTED` (pendente manual).
- ADR11: Caminho futuro — jobs com conexao `DIRECT_URL` dedicada e advisory lock para locks confiaveis fora do PgBouncer. No MVP usa-se o client pooled compartilhado (divida documentada).
- ADR12: `EmailTransport` abstrato; transporte `console` no MVP, provider real por env. Sem acoplar a provider de email do Supabase.
