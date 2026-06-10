# Horas - Persistencia Real (Rodada 2)

Spec tecnica para US-COR-01 a 04 (`docs/backlog-refinado-consultor-operacoes.md`).
Substitui o estado local/mock do modulo Horas por Prisma + Server Actions.

## 1. Convencoes de dominio

- Semana: segunda a domingo. `weekStart` = segunda 00:00 UTC; `weekEnd` = domingo 00:00 UTC (date-only).
- `TimeEntry.date`: sempre normalizada para meia-noite UTC (exigencia do motor de auto-aprovacao).
- `TimesheetPeriod`: upsert pela unique `(consultantId, startDate, endDate)` no primeiro lancamento da semana.
- Unidade de lancamento no banco: 1 `TimeEntry` por `(consultantId, projectId, activityType, date)`. A grade semanal (linha projeto+atividade com 7 dias) e uma AGREGACAO de leitura.
- Consultor atual: `getCurrentUser()` -> `prisma.consultant.findUnique({ where: { userId } })`. Sem `Consultant` vinculado: pagina mostra EmptyState "Seu usuario nao esta vinculado a um consultor. Contate um administrador."; actions retornam `NO_CONSULTANT`.
- Alocacao estrita: criar/editar/copiar exige `Allocation` com `status = ACTIVE`, mesmo consultor/projeto e `startDate <= date <= (endDate ?? +inf)`. Gravar `allocationId` na entry. Projeto `CLOSED` nunca recebe lancamento.

## 2. Contrato das Server Actions

Arquivo novo `apps/web/src/app/app/horas/actions.ts` (`"use server"`). Todas retornam
`ActionResult<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string }` (nunca lancam para o client) e chamam `revalidatePath` da rota afetada.

ErrorCode: `NO_DATABASE | NO_CONSULTANT | INVALID_INPUT | NOT_FOUND | FORBIDDEN | NO_ACTIVE_ALLOCATION | PROJECT_CLOSED | NOT_EDITABLE | DUPLICATE_ENTRY | PERIOD_CLOSED | NOTHING_TO_SUBMIT | ALREADY_DECIDED | COMMENT_REQUIRED`.

Schemas Zod em `apps/web/src/lib/timesheet/schemas.ts` (compartilhados com testes):

- `timeEntryInputSchema`: `projectId` (cuid), `activityType` (enum atual de `ActivityType`), `date` (`yyyy-mm-dd`), `hours` (number > 0 e <= 24, ate 2 casas), `description` (trim, max 500, opcional), `billable` (boolean).
- `decideHoursSchema`: `entryIds` (cuid[] min 1), `decision` (`"APPROVED" | "REJECTED"`), `comment` (string; obrigatorio nao-vazio quando `REJECTED` via `superRefine` -> `COMMENT_REQUIRED`).

### createTimeEntry(input)

Guarda: `requireUser` + consultor vinculado. Validacoes em ordem: Zod -> projeto existe e nao `CLOSED` -> alocacao ativa cobre a data -> upsert do `TimesheetPeriod` da semana da data (status do periodo `CLOSED` bloqueia: `PERIOD_CLOSED`). Se ja existe entry para `(consultantId, projectId, activityType, date)`:
- existente em `DRAFT`/`REJECTED`: atualiza hours/description/billable e volta para `DRAFT` (semantica de merge do mock);
- existente em `SUBMITTED`/`APPROVED`/`CLOSED`: retorna `DUPLICATE_ENTRY` (evita duplicata que o motor reprova).
Senao cria com `status = DRAFT`, `submittedAt = null`, `allocationId` resolvido.

### updateTimeEntry(input)

`{ id, hours, description, billable, date? }`. Owner check (`entry.consultantId === consultant.id`, senao `FORBIDDEN`). Editavel somente em `DRAFT`/`REJECTED` (`NOT_EDITABLE` para SUBMITTED/APPROVED/CLOSED). Edicao de `REJECTED` retorna a entry para `DRAFT` (`submittedAt = null`). Mudanca de `date` exige mesma semana do periodo e re-checa alocacao ativa.

### deleteTimeEntry({ id })

Owner check; permitido somente em `DRAFT`/`REJECTED`. Hard delete (sem Approval associado nesses status).

### copyPreviousWeek({ weekStart })

Copia da semana `weekStart - 7d` para `weekStart`, dia a dia (seg->seg ... dom->dom). Elegivel na origem: `status != REJECTED` e `hours > 0` (coerente com `isRowCopyable` do mock; APPROVED copia como novo `DRAFT` editavel). Idempotente: pula quando ja existe entry destino com a mesma chave `(consultantId, projectId, activityType, dateDestino)`, em QUALQUER status. Pula tambem (sem falhar a acao) itens sem alocacao ativa na data destino ou projeto `CLOSED`. Retorna `{ copied, skippedExisting, skippedIneligible }` para feedback honesto. Tudo em uma transacao; upsert do periodo destino antes.

### submitWeek({ weekStart })

Transacao unica: `updateMany` em entries do periodo com guarda `status = DRAFT` -> `status = SUBMITTED, submittedAt = now` (now unico para o lote). `count = 0` -> `NOTHING_TO_SUBMIT`. Periodo `CLOSED` -> `PERIOD_CLOSED`. Atualiza `TimesheetPeriod.status = SUBMITTED, submittedAt = now`. AuditEvent `TIMESHEET_PERIOD_SUBMITTED` (actor = user, after = { entryIds, total }). Nao chama `runAutoApproval` inline: o cron existente processa SUBMITTED na proxima janela (fail-closed ja garantido pelo `submittedAt`).

### decideHours({ entryIds, decision, comment })

Guarda: `requireRole(["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"])`. Escopo do PROJECT_MANAGER: somente entries cujo `project.managerUserId === user.id` (`FORBIDDEN` caso contrario); ADMIN/AREA_MANAGER sem restricao (modelo-dados secao 5). Para cada entry, transacao no padrao do motor (`auto-approval.ts#approveEntry`):
1. `updateMany({ where: { id, status: "SUBMITTED" } })` -> APPROVED/REJECTED; `count != 1` conta como `ALREADY_DECIDED` (race-safe, nao falha o lote);
2. `approval.create({ entityType: "TIME_ENTRY", entityId, approverUserId: user.id, status, comment, isAutomatic: false })`;
3. `auditEvent.create` acao `TIME_ENTRY_APPROVED` / `TIME_ENTRY_REJECTED` (actor = user, after = { comment }).
Apos o lote, recomputa `TimesheetPeriod.status` dos periodos afetados (ver secao 4). Retorna `{ decided, alreadyDecided }`.

## 3. Queries de leitura (`apps/web/src/lib/db/timesheet.ts`)

Assumem banco configurado (caller guarda com `isDatabaseConfigured()`).

- `getConsultantByUserId(userId)`.
- `getWeekForConsultant(consultantId, weekStart)`: periodo + entries da semana, agregadas no shape `TimesheetWeek`/`TimeEntryRow` atual (linha por projeto+atividade, `hours[7]`; linha herda o status das entries — entries da mesma linha com status distintos viram linhas separadas por status). Mantem os helpers puros de `lib/mock-data/timesheet.ts` (totais, deriveWeekStatus) reutilizados.
- `listAllowedProjects(consultantId, weekStart)`: projetos de `Allocation ACTIVE` cujo periodo intersecta a semana e projeto nao `CLOSED` (popula o select do form).
- `listHoursApprovalItems()`: pendentes = entries `SUBMITTED` agrupadas por `(consultantId, projectId, periodId)` com soma de horas, `entryIds[]`, label da semana e `submittedAt` mais antigo; historico = `Approval` de `entityType TIME_ENTRY` (join na entry para consultor/projeto), incluindo `isAutomatic/ruleKey/comment`. Mapeadas para `ApprovalItem` com `type: "HOURS"` + `entryIds`.

## 4. Transicoes de status

TimeEntry: `DRAFT -> SUBMITTED` (submitWeek, seta submittedAt) | `SUBMITTED -> APPROVED|REJECTED` (decideHours ou motor) | `REJECTED -> DRAFT` (edicao pelo dono) | `DRAFT|REJECTED -> (delete)` | `CLOSED` terminal (fechamento futuro; nesta rodada apenas bloqueia tudo). `APPROVED` imutavel nesta rodada.

TimesheetPeriod (recomputado apos submit/decisao/edicao): `CLOSED` se ja `CLOSED` (nunca sobrescreve); senao `REJECTED` se alguma entry `REJECTED`; senao `DRAFT` se alguma `DRAFT` (ou sem entries); senao `SUBMITTED` se alguma `SUBMITTED`; senao `APPROVED`. Reenvio apos reprovacao: consultor edita (REJECTED->DRAFT) e usa submitWeek de novo.

## 5. RBAC por acao

- create/update/delete/copy/submit: usuario autenticado COM `Consultant` vinculado; ownership pela FK `consultantId` (consultor so opera as proprias horas). O vinculo `Consultant.userId` e o gate operacional do papel CONSULTANT.
- decideHours e leitura da fila: `requireRole(["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"])` (mesma lista de `/app/aprovacoes` no route map) + escopo de projeto para PROJECT_MANAGER.
- Nenhum dado financeiro exposto nessas telas (sem mudanca em FINANCIAL_ROLES).

## 6. Comportamento sem banco / sem consultor

- `isDatabaseConfigured() === false`: `/app/horas` e a fila HOURS de `/app/aprovacoes` mantem o comportamento local/mock atual, mas exibem banner persistente (tone warning) "Modo demonstracao: banco nao configurado. Nada sera persistido." As mensagens "(local)" existentes permanecem. Server Actions retornam `NO_DATABASE` se invocadas.
- Banco configurado + usuario sem `Consultant`: EmptyState com orientacao (secao 1); nenhuma grade mock e exibida (nao fingir dados).

## 7. Troca dos mocks (arquivos)

- Novos: `apps/web/src/app/app/horas/actions.ts`, `apps/web/src/lib/db/timesheet.ts`, `apps/web/src/lib/timesheet/schemas.ts`, `apps/web/src/lib/timesheet/week.ts` (helpers puros de semana UTC: weekStartOf, addDays, label, parse de `?semana=`).
- `apps/web/src/app/app/horas/page.tsx`: vira async; `requireUser` + branch demo/sem-consultor/real; le `searchParams.semana` (default semana atual) e passa dados + flags para a view. Navegacao de semana via link `?semana=` (server-driven, sem limite de 3 semanas).
- `apps/web/src/components/timesheet/TimesheetWeekView.tsx`: passa a receber `mode: "demo" | "db"`, dados da semana, projetos permitidos e a chamar as actions (`useTransition` + feedback com a mensagem do `ActionResult`); estado local permanece SOMENTE no modo demo.
- `apps/web/src/components/timesheet/TimeEntryForm.tsx`: `dayIndex` -> `date` resolvida pela view; validacao client mantida como pre-checagem (servidor e a autoridade).
- `apps/web/src/app/app/aprovacoes/page.tsx` + `ApprovalQueue`/`ApprovalDecisionPanel`: pagina busca itens HOURS reais (`listHoursApprovalItems`) e mescla com itens EXPENSE do mock (marcados como demo); decidir HOURS chama `decideHours` com `entryIds`; decidir EXPENSE segue local com mensagem "(local)". `ApprovalItem` ganha `entryIds?: string[]` e flag `source: "db" | "mock"`.
- `apps/web/src/lib/mock-data/timesheet.ts` / `approvals.ts`: mantidos para o modo demo e para os helpers puros; tipos compartilhados (`ActivityType`, labels, `TimeEntryRow`) migram para `apps/web/src/lib/timesheet/types.ts` para a UI nao importar de `mock-data` no modo real.

## 8. Pendencias registradas na revisao (Rodada 2)

Corrigidos na propria rodada: fallback de email do consultor restrito a dev
auth; escopo do PROJECT_MANAGER aplicado antes do limite do historico; copia
para semana fechada responde PERIOD_CLOSED mesmo sem origem; label de
atividade desconhecida exibida crua na fila; itens mock marcados com badge
"Demo" quando ha banco; script de smoke exige `--write` + banco de validacao.

Pendentes (decisao de PO/UX ou rodada futura):

- Indice unico em `(consultantId, projectId, activityType, date)` no banco +
  tratamento de P2002 como merge (hoje a deduplicacao e transacional).
- Semantica do modal de edicao em modo db: trocar o dia nao MOVE o lancamento
  (age como celula da grade); confirmar intencao e cobrir com teste.
- Bloquear auto-aprovacao das proprias horas (PM/ADMIN que tambem e
  consultor) — regra classica de controle, decidir antes do fechamento mensal.
- Contadores da fila somam itens reais + mock de despesas.
- `select` estreito nas queries de leitura para nao trazer
  `billingHourlyRate` a memoria (defesa em profundidade; nao ha vazamento).
- Testes: update com mudanca de data colidindo (`DUPLICATE_ENTRY`); decisao em
  lote misto SUBMITTED+DRAFT.

## 9. Testes minimos

- `week.ts`: weekStart seg-dom em UTC, normalizacao meia-noite, fronteiras de mes/ano.
- Schemas: horas 0, negativa, > 24, comentario vazio em REJECTED.
- Actions com Prisma mockado (padrao `auto-approval-run.test.ts`): alocacao inexistente/PLANNED/expirada (`NO_ACTIVE_ALLOCATION`); editar SUBMITTED/APPROVED/CLOSED (`NOT_EDITABLE`); submit sem rascunho (`NOTHING_TO_SUBMIT`); submit seta `submittedAt` e periodo; copia idempotente (segunda chamada -> `copied = 0`); decisao em entry ja decidida (`ALREADY_DECIDED`); PROJECT_MANAGER fora de escopo (`FORBIDDEN`); Approval + AuditEvent criados na mesma transacao da decisao.
