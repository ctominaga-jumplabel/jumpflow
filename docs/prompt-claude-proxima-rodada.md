# Prompt - Proxima Rodada (Rodada 2: Persistencia de Horas)

Planejamento gerado em 2026-06-10 apos a entrega da Rodada 1 em producao
(commits `d343425` e `3c91073`). Decisao do `jump-product-owner`: executar a
**Rodada 2 - Persistencia de Horas** antes de Despesas (Rodada 3) ou de uma
rodada intermediaria de schema/storage.

## Por que Rodada 2 primeiro

- Menor risco: `TimeEntry`, `TimesheetPeriod`, `Approval` e `AuditEvent` ja
  existem no schema e nas migrations versionadas; provavelmente nenhuma
  migration nova e necessaria.
- Maior valor para consultores: horas e o ciclo central do MVP e hoje o estado
  e local (perde-se ao recarregar a pagina).
- Sem dependencia de Supabase Storage (so Despesas precisam) e sem as decisoes
  pendentes de bucket/limites/fluxo de aprovacao de despesas (secao 11 do
  backlog refinado).
- Ativa valor ja construido: a automacao de aprovacao automatica opera sobre
  `TimeEntry` no banco e passa a funcionar de verdade.
- Testavel sem Supabase real (fake do Prisma client, sem rede).

Despesas (Rodada 3) vem em seguida; as pendencias de storage podem ser
decididas em paralelo sem bloquear a Rodada 2.

## Decisoes confirmadas para iniciar

1. **Gate de banco**: autorizado aplicar `npm run db:deploy` e
   `npm run db:seed` no Supabase real.
2. **Ambiente de validacao**: persistencia permitida enquanto os dados forem
   ficticios de validacao. Como producao ainda usa
   `AUTH_DEV_MODE=true` + `ALLOW_DEV_AUTH_IN_PRODUCTION=true`, nao inserir dados
   reais da Jump ate ativar Entra ID.
3. **Seed operacional**: usar clientes, projetos, consultores e alocacoes
   ficticios de validacao.
4. **Regra de alocacao**: aplicar de forma estrita desde a Rodada 2. Consultor
   so lanca horas em projeto com alocacao ativa, salvo permissao administrativa
   explicita.
5. **Aprovacao automatica**: iniciar `autoApprovalEnabled=true` no ambiente de
   validacao, usando apenas dados ficticios e logs/auditoria.

## Prompt sugerido para a proxima execucao

```text
Leia primeiro o arquivo CLAUDE.md.

Depois leia, nesta ordem:
- docs/prompt-claude-proxima-rodada.md
- docs/backlog-refinado-consultor-operacoes.md (secao "Rodada 2 - Persistencia de Horas")
- docs/modelo-dados.md
- docs/database-foundation.md
- docs/aprovacao-automatica.md
- packages/database/prisma/schema.prisma

Contexto:
A Rodada 1 (horas mock funcionais, despesas mock, launcher /app) esta em
producao. O pos-login default e /app. As migrations Prisma estao versionadas
mas nunca foram aplicadas a banco real; o .env local ja tem DATABASE_URL
(pooled, 6543) e DIRECT_URL (direto, 5432) corretos.

Objetivo desta rodada:
Rodada 2 - Persistencia real de Horas, em duas sub-rodadas.

Sub-rodada 2.0 - Fundacao de banco aplicada:
- `npm run db:deploy` e `npm run db:seed`.
- Estender o seed (idempotente) com clientes, projetos, alocacoes e o
  registro Consultant vinculado ao usuario dev, sempre com dados ficticios de
  validacao.
- Smoke: login dev + leitura de papeis persistidos.
- Atencao (Windows): parar o dev server antes de `prisma generate` (EPERM na
  DLL do query engine).

Sub-rodada 2.1 - Persistencia de Horas:
- US-COR-01: novo lancamento via Server Action, validacao Zod no servidor,
  vinculo a TimesheetPeriod semanal, regra de alocacao ativa estrita.
- US-COR-02: copiar semana anterior persistido e idempotente.
- US-COR-03: enviar horas (DRAFT -> SUBMITTED, submittedAt, bloqueio de
  edicao no servidor, integra com aprovacao automatica existente).
- US-COR-04: aprovar/reprovar com Approval + AuditEvent; reprovar exige
  comentario (validado no servidor).
- /app/aprovacoes lendo horas reais (tipo HOURS; EXPENSE continua mock).

Fora do escopo (nao implementar):
- Modelo Expense, Supabase Storage, storageProvider (Rodada 3).
- Relatorios/CSV (Rodada 4).
- CRUDs de cadastros (dados entram por seed).

Agentes:
1. jump-devops (sub-rodada 2.0)
2. jump-data-modeler (verificar necessidade de migration, seed operacional)
3. jump-timesheet-agent (regras de periodo, transicoes, bloqueios)
4. jump-fullstack-engineer (Server Actions, queries, RBAC, troca dos mocks)
5. jump-qa-engineer (testes com fake do Prisma client, sem rede)
6. jump-code-reviewer (revisao final)

Criterios de pronto:
- Migrations aplicadas e seed idempotente executado.
- Seed usa apenas dados ficticios.
- Horas sobrevivem a reload (criar, editar, copiar, enviar).
- Toda mutacao com Zod + RBAC no servidor; consultor so altera os proprios
  lancamentos DRAFT/REJECTED.
- Enviar/aprovar/reprovar geram Approval e AuditEvent.
- Aprovacao automatica funciona ponta a ponta contra o banco.
- Feedback honesto quando o banco esta indisponivel.
- npm run typecheck, lint, test e build passam; deploy Vercel validado.

Execute com cuidado, valide, revise com jump-code-reviewer, commite e faca
push. Mensagem de commit sugerida: `feat: persist timesheet entries`.
```

## Observacoes operacionais (estado em 2026-06-10)

- O projeto Vercel **nao tem integracao Git**: deploys sao manuais via
  `npx vercel deploy --prod` na raiz do repo. Recomendado conectar o GitHub
  (`npx vercel git connect`) para deploy automatico de `main`.
- Producao (`jumpflow-sepia.vercel.app`) e um ambiente de validacao com
  `AUTH_DEV_MODE=true` + `ALLOW_DEV_AUTH_IN_PRODUCTION=true`: rotas `/app/*`
  respondem 200 sem login real (visitante = DEV_USER). Nao usar com dados
  reais ate ativar o Entra ID.
