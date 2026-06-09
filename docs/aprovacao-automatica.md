# Aprovação Automática de Horas + Relatório de Ausência

Status: **implementado** o motor de aprovação automática de `TimeEntry` e o
relatório semanal por email de ausência de lançamento **por projeto**, com
provider de email real (Resend) e **múltiplos destinatários** (lista separada
por vírgula). Regras e config vivem no banco (não hardcoded), jobs são
idempotentes e o caminho para worker/fila está documentado como evolução.

Fontes relacionadas: `docs/modelo-dados.md`, `docs/arquitetura.md`
(ADR08–ADR12), `docs/database-foundation.md`, `docs/backlog-mvp.md`
(US07.03/US07.04/US10.03).

## 1. Visão Geral

- **Domínio puro** (`packages/shared/src/automation/`): regras testáveis sem
  banco/Next.
  - `auto-approval.ts`: `evaluateAutoApproval`, `findDuplicateEntryIds`,
    `dailyTotalKey`, `hoursToMinutes`, settings padrão.
  - `missing-timesheets.ts`: `buildMissingTimesheetCsv`,
    `missingTimesheetReferenceKey`.
- **Orquestração** (`apps/web/src/lib/automation/`): acesso a I/O (Prisma,
  email).
  - `config.ts`: carrega `AutomationConfig` (upsert do singleton) + defaults/env.
  - `auto-approval.ts`: `runAutoApproval()` — monta contexto e aplica decisões.
  - `missing-timesheets.ts`: `runMissingTimesheetReport()` — gera CSV e envia.
  - `email-transport.ts`: `EmailTransport` plugável (console no MVP).
  - `job-auth.ts`: `isCronAuthorized()` (Bearer `CRON_SECRET`).
- **Endpoints** (cron-friendly): `POST /api/jobs/auto-approval` e
  `POST /api/jobs/missing-timesheets`.

## 2. Regras de Aprovação Automática

O avaliador é **fail-closed**: acumula todos os motivos e só aprova quando não há
nenhum. Caso contrário o lançamento permanece `SUBMITTED` (pendente de aprovação
manual). O motor **nunca reprova**.

### Regra padrão (dia útil)

Aprovada quando, para o lançamento `SUBMITTED`:

- é dia útil (seg–sex);
- o **total diário** do consultor naquele dia (soma de lançamentos
  `SUBMITTED` + `APPROVED`) é exatamente `requiredDailyMinutes` (480 = 08:00);
- não há duplicidade;
- passaram-se ≥ `approvalDelayMinutes` (5 min) desde `submittedAt`.

### Regra exceção (`ANY_HOURS`)

Lista configurável de pares **consultor + projeto** (`AutoApprovalException` com
`type = ANY_HOURS`). Dispensa a checagem do total de 8h (qualquer quantidade de
horas). Duplicidade, atraso de 5 min e validade continuam valendo. Não libera
fim de semana.

### Regra FDS (`WEEKEND`)

Lista configurável de pares **consultor + projeto** (`type = WEEKEND`). Libera
lançamentos em sábado/domingo e dispensa o total de 8h no fim de semana.
Duplicidade e atraso de 5 min continuam valendo.

### Composição e `ruleKey`

As flags são derivadas **sempre** da `AutoApprovalException` por
(consultantId, projectId), nunca do próprio lançamento. Um par pode estar nas
duas listas; o `ruleKey` registra as regras aplicadas:
`DEFAULT`, `EXCEPTION_ANY_HOURS`, `EXCEPTION_WEEKEND` ou
`EXCEPTION_ANY_HOURS+EXCEPTION_WEEKEND`.

### Motivos de pendência (`reasons`)

Ordem canônica e determinística: `ENTRY_NOT_SUBMITTED`, `NOT_SUBMITTED_YET`,
`INVALID_HOURS`, `DELAY_NOT_ELAPSED`, `DUPLICATE`, `WEEKEND_NOT_ALLOWED`,
`DAILY_TOTAL_MISMATCH`.

### Duplicidade

Chave: `(consultantId, projectId, date, activityType)`. Quando o grupo tem mais
de um lançamento, **todos** os membros ficam pendentes — deduplicar exige
julgamento humano. Detecção considera `SUBMITTED` + `APPROVED` do dia.

## 3. Idempotência

- **Aprovação**: somente lançamentos `SUBMITTED` são elegíveis e a aprovação é
  aplicada por `updateMany({ where: { id, status: SUBMITTED }, data: { status:
  APPROVED } })` dentro de uma transação. Se `count !== 1`, outra execução já
  processou (campo `raced` no resultado) e nada é duplicado. O `Approval`
  (`isAutomatic = true`, `ruleKey`, `approverUserId = null`) e o `AuditEvent`
  (`action = TIME_ENTRY_AUTO_APPROVED`, `actorUserId = null`) são gravados **na
  mesma transação** — auditoria nunca diverge da aprovação.
- **Email/relatório**: `AutomationEmailLog` com `@@unique([type, referenceKey])`.
  Um log `SENT` para o período curto-circuita reenvios; um `FAILED` é retentado
  (upsert promove `FAILED → SENT`). Sem consultores faltantes: não envia email,
  mas registra o período como processado (rowCount 0) para não recomputar.

## 4. Configuração (`AutomationConfig`, singleton id="default")

| Campo                  | Default | Descrição                                  |
| ---------------------- | ------- | ------------------------------------------ |
| `autoApprovalEnabled`  | `true`  | Liga/desliga o motor sem deploy.           |
| `requiredDailyMinutes` | `480`   | Total diário exigido pela regra padrão.    |
| `approvalDelayMinutes` | `5`     | Atraso mínimo após o envio.                |
| `reportRecipientEmail` | `null`  | Destinatário(s) do relatório (fallback: env). |

> `reportRecipientEmail` é interpretado como **lista separada por vírgula**
> (ex: `"a@x.com,b@y.com"`). O código faz parse/normalize/dedupe dos endereços.
> Quando definido no banco, **sobrepõe** o env `AUTOMATION_REPORT_EMAIL` (que
> também aceita lista por vírgula).

Listas de exceção: tabela `AutoApprovalException` (consultor + projeto + tipo +
`active`). Gestão via CRUD/tela é dívida futura (US07.04).

## 5. Endpoints de Job (cron-friendly)

Protegidos por `Authorization: Bearer <CRON_SECRET>` (comparação em tempo
constante). Sem `CRON_SECRET`: liberados apenas fora de produção.

```bash
# Aprovação automática
curl -X POST https://<host>/api/jobs/auto-approval \
  -H "Authorization: Bearer $CRON_SECRET"

# Relatório (período opcional; default = semana anterior completa, seg–dom)
curl -X POST https://<host>/api/jobs/missing-timesheets \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"periodStart":"2026-06-01","periodEnd":"2026-06-08"}'
```

### Vercel Cron

O bloco `crons` **já está no `vercel.json` do repositório** com a agenda real:

```json
{
  "crons": [
    { "path": "/api/jobs/auto-approval", "schedule": "*/10 * * * *" },
    { "path": "/api/jobs/missing-timesheets", "schedule": "0 12 * * 1" }
  ]
}
```

- `auto-approval`: a cada 10 min (`*/10 * * * *`) — **requer plano Vercel Pro**;
  em Hobby use frequência diária/horária.
- `missing-timesheets`: segunda 12:00 UTC = **09:00 BRT** (`0 12 * * 1`).

O Vercel Cron envia `Authorization: Bearer $CRON_SECRET` automaticamente quando
`CRON_SECRET` está nas env vars do projeto. O agendador dispara o path por
**GET** (sem corpo), então cada rota exporta um handler `GET` (alias do `POST`)
além do `POST` manual — sem `GET`, o run agendado retornaria 405. No `GET` o
relatório usa o default de semana anterior; o `POST` aceita período via corpo.

A route do relatório (`/api/jobs/missing-timesheets`) declara `maxDuration = 60`
porque agrega alocações/lançamentos por projeto numa única query; isso evita
estourar o timeout serverless padrão.

## 6. Email e CSV

### Provider de email

- `EmailTransport` abstrato; selecionado por `EMAIL_PROVIDER` (sem acoplar ao
  Supabase).
- `console` (default/fallback): loga a mensagem e retorna um id. Também é o
  fallback quando o provider real está mal configurado.
- `resend` (`EMAIL_PROVIDER=resend`): envia de verdade via `POST
  https://api.resend.com/emails` por `fetch` nativo (sem SDK npm). Requer
  `RESEND_API_KEY` e `RESEND_FROM_EMAIL` (remetente verificado no Resend). O CSV
  vai como **anexo base64**. Suporta **múltiplos destinatários** (`to: string[]`).
- Destinatários: `AutomationConfig.reportRecipientEmail` (lista por vírgula no
  banco) sobrepõe `AUTOMATION_REPORT_EMAIL` (lista por vírgula no env);
  parse/normalize/dedupe no código.

### CSV por projeto

O relatório é **semanal por projeto alocado**. Cada linha é a combinação
consultor × projeto. Colunas (estáveis, BOM UTF-8 para Excel, header presente
mesmo com zero linhas):

`periodStart, periodEnd, consultantId, consultantName, consultantEmail, area,
seniority, projectId, projectName, status, loggedInOtherProject, generatedAt`

- `status`:
  - `SEM_LANCAMENTO_NO_PROJETO`: nenhum lançamento do consultor no projeto no
    período.
  - `RASCUNHO_NAO_ENVIADO_NO_PROJETO`: existe lançamento no projeto, mas só em
    `DRAFT`/`REJECTED` (não submetido efetivamente).
- `loggedInOtherProject`: o consultor fez submissão efetiva
  (`SUBMITTED`/`APPROVED`/`CLOSED`) em **outro** projeto no período.

### Regra de geração

Universo = consultor `ACTIVE` × alocação `ACTIVE`/`PLANNED` que **intersecta o
período** × projeto `ACTIVE`/`PAUSED`. Para cada par consultor×projeto:

- **compliant** (não entra no relatório): houve submissão efetiva no projeto
  (`SUBMITTED`/`APPROVED`/`CLOSED`);
- rascunho/rejeitado no projeto → `RASCUNHO_NAO_ENVIADO_NO_PROJETO`;
- nenhum lançamento no projeto → `SEM_LANCAMENTO_NO_PROJETO`;
- `loggedInOtherProject` é marcado quando há submissão efetiva em outro projeto.

## 7. Variáveis de Ambiente

| Var                      | Uso                                                          |
| ------------------------ | ------------------------------------------------------------ |
| `CRON_SECRET`            | Protege os endpoints de job (Bearer).                        |
| `EMAIL_PROVIDER`         | Transporte de email: `console` (default) ou `resend`.        |
| `RESEND_API_KEY`         | Server-only. Obrigatório quando `EMAIL_PROVIDER="resend"`.   |
| `RESEND_FROM_EMAIL`      | Remetente verificado no Resend (ex: `JumpFlow <no-reply@…>`).|
| `AUTOMATION_REPORT_EMAIL`| Destinatário(s) fallback — lista separada por vírgula.       |

## 8. Testes

- Avaliador puro: padrão (aprova/boundary 5 min), pendência por cada motivo,
  exceção `ANY_HOURS` (e que não burla duplicidade/atraso), FDS, combinação,
  guards de escopo, múltiplos motivos ordenados.
- `findDuplicateEntryIds`, CSV estável, `referenceKey`.
- `isCronAuthorized` (Bearer ok/errado/ausente; sem secret dentro/fora de prod).
- Idempotência dos runners (Prisma mockado): aprova uma vez e não duplica na
  2ª execução; relatório envia uma vez e pula reenvio do mesmo período.

## 9. Migration e Ação Manual

A migration `20260609130000_automation_auto_approval` foi **gerada offline**
(`prisma migrate diff`) e versionada, mas **não foi aplicada** a nenhum banco.
Para aplicar no Supabase (cria/atualiza tabelas reais):

```bash
npm run db:deploy   # aplica init + automation
npm run db:seed     # roles + dev user (idempotente)
```

> Atenção: a alteração de `Approval.approverUserId` para nullable + FK assume
> base sem linhas órfãs. Como a base do MVP ainda não foi materializada, é
> seguro; se houver dados, sanear `approverUserId` órfãos antes do deploy.

## 10. Dívida Técnica (decisões conscientes do MVP)

- **Concorrência**: a idempotência se apoia no status-guard transacional. Não há
  advisory lock nem tabela `AutomationRun` de observabilidade (ADR09). Para
  cargas maiores ou execução concorrente intensa, adicionar `pg_advisory_xact_lock`
  e/ou `AutomationRun(runKey unique)`.
- **Conexão do job**: usa o client pooled (PgBouncer 6543) compartilhado. Para
  locks de sessão confiáveis e isolamento de pool, migrar jobs para `DIRECT_URL`
  dedicada (ADR11) quando necessário.
- **Auditoria de pendências**: lançamentos que ficam pendentes não geram
  `AuditEvent` (evita ruído/escrita por execução). Avaliar log de "skipped".
- **Unicidade na origem**: índice único parcial para duplicidade
  (`WHERE status NOT IN ('DRAFT','REJECTED')`) e CHECK de coerência
  `isAutomatic`/`approverUserId`/`ruleKey` ficam para uma migration SQL futura.
- **Dia misto** (projeto exceção + normal no mesmo dia): a checagem de 8h é
  por-lançamento; a regra `strictMixedDay` configurável é evolução.
- **Relatório**: o relatório semanal **por projeto** e os **múltiplos
  destinatários** (lista por vírgula) já estão implementados. Continuam dívida:
  dias úteis esperados, datas faltantes específicas e janelas de período
  configuráveis (hoje o default é a semana anterior completa, seg–dom).
- **Worker/fila**: ao crescer volume/integrações, mover os runners para um worker
  (BullMQ/Render). O domínio puro migra intacto; troca-se só o orquestrador.

### Dependências e convenções a respeitar

- **Gatilho de submissão**: o motor exige `TimeEntry.submittedAt != null` e
  `status = SUBMITTED`. A story de lançamento/submissão de horas (EP06) é quem
  deve setar `submittedAt` na transição `DRAFT → SUBMITTED`. Até lá, ligar o cron
  não aprova nada (fail-closed por design).
- **Fuso de `TimeEntry.date`**: a soma diária (`dailyTotalKey`) e a classificação
  de fim de semana (`isWeekend`) usam o **dia UTC**. A escrita de `date` deve
  normalizar para meia-noite UTC (date-only) para evitar deslocamento de dia.
- **Total diário exato**: a regra padrão exige soma diária **exatamente** igual a
  `requiredDailyMinutes` (sem tolerância). Tolerância configurável é evolução.
- **Concorrência do email**: o envio é reservado antes do disparo (create
  unique-guarded → status `FAILED` = reservado) para evitar envio duplicado sob
  cron concorrente; mesmo assim, um crash entre enviar e marcar `SENT` pode gerar
  reenvio na próxima janela (at-least-once aceitável no MVP).
