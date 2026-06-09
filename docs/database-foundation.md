# Database Foundation - JumpFlow

Status: a **fundacao de banco de dados** foi implementada com Prisma 6.19.3 e
PostgreSQL. Inclui: client singleton, schema validado, primeira migration
versionada, seed idempotente de papeis, camada de persistencia de usuarios,
RBAC persistido (fail-closed) e helper de auditoria. A integracao com a Auth
Foundation e **progressiva**: a aplicacao continua funcionando (login, dev mode,
telas) mesmo sem banco configurado.

Fontes de verdade relacionadas:

- Modelo de dados: `docs/modelo-dados.md`
- Arquitetura: `docs/arquitetura.md` (ADR03 Supabase, ADR04 Prisma, ADR06 Render)
- Auth Foundation: `docs/auth-foundation.md`

## 1. Visao Geral

- ORM: **Prisma 6.19.3** (nao migrar para Prisma 7 nesta fase).
- Banco alvo: **PostgreSQL**.
- Banco inicial: **Supabase Postgres**.
- Futuro: **Render + PostgreSQL** (sem acoplar regras a recursos exclusivos do
  Supabase).
- Pacote de dados: `packages/database` (`@jumpflow/database`).

### Arquivos principais

- `packages/database/src/client.ts` — Prisma client singleton.
- `packages/database/src/index.ts` — ponto unico de import (`prisma`, tipos e
  enums gerados).
- `packages/database/prisma/schema.prisma` — schema (15 entidades + enums).
- `packages/database/prisma/migrations/` — migrations versionadas.
- `packages/database/prisma/seed.mjs` — seed idempotente.
- `apps/web/src/lib/db/config.ts` — `isDatabaseConfigured()`.
- `apps/web/src/lib/db/users.ts` — sync de usuario + RBAC persistido.
- `apps/web/src/lib/db/audit.ts` — helper de auditoria.

## 2. Prisma Client Singleton

`packages/database/src/client.ts` cacheia uma unica instancia em `globalThis`
fora de producao, evitando esgotar conexoes no hot-reload do Next. Em producao
cada lambda usa uma instancia propria. O construtor **nao** abre conexao
(conecta de forma lazy na primeira query), entao importar o modulo e seguro
mesmo sem `DATABASE_URL`.

Uso:

```ts
import { prisma } from "@jumpflow/database";
```

Nunca instancie `new PrismaClient()` na aplicacao — sempre use `prisma`.

## 3. DATABASE_URL vs DIRECT_URL

O `schema.prisma` declara:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

- **DATABASE_URL** — usada pela aplicacao em runtime. No Supabase, prefira a
  conexao **POOLED** (PgBouncer, porta `6543`), ideal para serverless/Vercel.
- **DIRECT_URL** — usada pelo **Prisma Migrate** (DDL, shadow database). Deve
  ser a conexao **DIRETA** (porta `5432`).

Formato Supabase (substitua `[ref]`, `[password]`, `[region]`):

```bash
# Pooled (runtime)
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
# Direct (migrations)
DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
```

> **Atencao:** `DATABASE_URL` deve ser uma connection string `postgresql://`,
> **nao** a URL de API do projeto Supabase (`https://[ref].supabase.co`). Uma URL
> `https://...` faz o Prisma falhar ao conectar.

Sem `DATABASE_URL` valida, a aplicacao continua funcionando: o dev mode segue
ativo e a persistencia/RBAC/auditoria ficam inertes (ver secao 7).

## 4. Configuracao do Supabase

1. Crie um projeto em <https://supabase.com>.
2. Em **Project Settings -> Database -> Connection string**, copie:
   - **Transaction pooler** (6543) -> `DATABASE_URL` (acrescente
     `?pgbouncer=true`).
   - **Direct connection** (5432) -> `DIRECT_URL`.
3. Cole ambas no `.env` (local) e nas variaveis de ambiente da Vercel.
4. Mantenha as regras de negocio no codigo; nao use RLS/funcoes do Supabase como
   fonte de regra (preserva a migracao para Render).

## 5. Migration

A primeira migration ja esta versionada em
`packages/database/prisma/migrations/20260609120000_init/migration.sql`
(gerada offline via `prisma migrate diff`, sem conectar a nenhum banco).

### Aplicar em um banco novo

```bash
# Aplica todas as migrations versionadas (CI/produacao/Vercel)
npm run db:deploy

# OU, em desenvolvimento, criar/aplicar e regenerar o client:
npm run db:migrate
```

### Criar novas migrations (apos editar o schema)

```bash
npm run db:migrate    # prisma migrate dev — cria a migration e aplica em dev
```

### Banco existente com tabelas ja criadas (baseline)

Se as tabelas ja existirem (ex.: aplicadas manualmente), marque a migration
inicial como aplicada para nao recria-la:

```bash
cd packages/database
npx prisma migrate resolve --applied 20260609120000_init
```

> Esta rodada **nao** aplicou a migration contra um banco real: a `DATABASE_URL`
> do ambiente ainda nao estava configurada com uma connection string Postgres
> valida. Configure-a (secao 3) e rode `npm run db:deploy`.

## 6. Seed

`packages/database/prisma/seed.mjs` e **idempotente**:

- Faz `upsert` dos 7 papeis (`ADMIN`, `CONSULTANT`, `PROJECT_MANAGER`,
  `AREA_MANAGER`, `FINANCE`, `PEOPLE`, `SALES`).
- Quando `AUTH_DEV_MODE=true`, faz `upsert` de um usuario de desenvolvimento
  (`ana.martins@jumplabel.com.br`) com todos os papeis, espelhando o `DEV_USER`
  da Auth Foundation.

Rodar:

```bash
npm run db:seed
# ou via Prisma:  cd packages/database && npx prisma db seed
```

Pode rodar quantas vezes quiser — nao duplica dados.

## 7. Integracao com a Auth Foundation (progressiva)

`getCurrentUser()` (`apps/web/src/lib/auth/current-user.ts`) decide a origem dos
papeis:

1. **Dev mode** (`AUTH_DEV_MODE=true` e `NODE_ENV != production`): retorna o
   `DEV_USER`. **Nunca** toca o banco.
2. **Sessao real, sem banco** (`DATABASE_URL` vazia): mapeia a sessao Auth.js em
   `AppUser` usando os papeis da sessao (comportamento da Auth Foundation).
3. **Sessao real, com banco**: chama `syncUserFromAuth()` (upsert por email) e
   usa os **papeis persistidos** como fonte autoritativa de RBAC.

### Fail-closed

Se o banco esta configurado mas inacessivel, `getCurrentUser()` autentica o
usuario **sem papeis** (`roles: []`) — nunca concede acesso amplo. Em producao,
um usuario sem papeis nao passa em `requireRole(...)`.

`requireUser` / `requireRole` / `hasRole` permanecem inalterados; passaram a
operar sobre os papeis persistidos quando o banco esta ativo.

## 8. Auditoria

`recordAuditEvent()` (`apps/web/src/lib/db/audit.ts`) grava em `AuditEvent`
(`actorUserId`, `entityType`, `entityId`, `action`, `before`, `after`). E um
**no-op seguro** sem banco e nunca derruba a operacao que a disparou (erros sao
logados, nao propagados). `buildAuditEventData()` e puro e testavel.

Ainda **nao** esta integrado em todos os fluxos — sera chamado conforme os
modulos sensiveis (valor hora, alocacoes, aprovacoes, fechamentos, permissoes)
forem implementados.

## 9. Validacao de Conexao

```bash
# Gera o client (offline, nao conecta)
npm run db:generate

# Verifica conectividade + aplica migrations pendentes
npm run db:deploy

# Inspeciona os dados
npm run db:studio
```

Se `db:deploy` falhar com erro de host/credencial, revise a secao 3 (formato das
URLs) — em especial que `DATABASE_URL` nao seja a URL `https://` de API.

## 10. Scripts

| Script             | Acao                                                   |
| ------------------ | ------------------------------------------------------ |
| `npm run db:generate` | Gera o Prisma Client (offline).                     |
| `npm run db:migrate`  | `prisma migrate dev` (cria/aplica em desenvolvimento).|
| `npm run db:deploy`   | `prisma migrate deploy` (aplica em CI/producao).    |
| `npm run db:seed`     | Roda o seed idempotente.                            |
| `npm run db:studio`   | Abre o Prisma Studio.                               |

## 11. Cuidados para a Migracao Render + PostgreSQL

- Manter **todas** as migrations Prisma versionadas (fonte da verdade do schema).
- Nao depender de RLS, Edge Functions, Realtime ou Auth do Supabase como regra
  de negocio — tudo isso vive no codigo da aplicacao.
- Migrar e trocar `DATABASE_URL`/`DIRECT_URL` para o Postgres do Render e rodar
  `npm run db:deploy` + `npm run db:seed`.
- Em Render, o pooling pode mudar: revisar se `pgbouncer=true` ainda se aplica e
  ajustar `connection_limit` conforme o ambiente.
- Criar scripts de export/import (pg_dump/pg_restore) quando a migracao se
  aproximar.

## 12. Notas

- O aviso `package.json#prisma is deprecated` (Prisma 7) e esperado: mantemos a
  config de seed em `package.json` propositalmente, pois `prisma.config.ts`
  desativaria o auto-load do `.env`. Sera revisto se/quando migrarmos o Prisma.
- Indices em chaves estrangeiras foram adicionados ja na primeira migration
  (PostgreSQL nao indexa FKs automaticamente).

## 13. Divida Tecnica Conhecida

A resolver **antes** de implementar os modulos de Projeto / Aprovacao /
Fechamento (mantido fora desta rodada para preservar o escopo minimo):

- `Project.managerUserId`, `MonthlyClosing.closedByUserId` e
  `Approval.approverUserId` sao `String` com indice, mas **sem FK** para `User`.
  Avaliar transformar em relacao (`onDelete: SetNull`/`Restrict`) para garantir
  integridade referencial nos fluxos financeiros e de aprovacao.
- `Allocation.allocationPercent` nao tem CHECK no banco (0 < pct <= 100); a regra
  hoje depende da validacao de aplicacao (Zod).
- Cobrir com testes de RBAC a **leitura mascarada** de campos financeiros
  (`hourlyCost`, `billingHourlyRate`) quando os endpoints existirem.
- Considerar um teste que afirme que `ROLE_NAMES` (app), o enum `RoleName`
  (Prisma) e a lista do seed permanecem sincronizados.
