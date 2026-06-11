# Relatorios, Exportacoes e Fechamento-visualizacao (Rodada 4)

Spec tecnica para a Rodada 4 (`docs/prompt-claude-rodada-4-relatorios-fechamento.md`).
Adiciona a rota `/app/relatorios` com tres segmentos (Horas, Despesas,
Consolidado), exportacao CSV server-side e uma visao de fechamento. Mesmo
formato/padroes de `docs/horas-persistencia.md` (Rodada 2) e
`docs/despesas-persistencia.md` (Rodada 3): `ActionResult`, `getConsultantForUser`,
`resolveDbUser`, RBAC server-side e cadeias de status ja persistidas. NAO ha
modelo novo de fechamento, NAO ha lock de periodo: fechamento e VISUALIZACAO.

## 1. Convencoes de dominio

- Datas de filtro normalizadas via `parseIsoDateUtc` (`lib/timesheet/week.ts`); range inclusivo (`from <= date <= to`).
- "Entra no fechamento": HORAS com `status = APPROVED`; DESPESAS com `status in (FINANCE_APPROVED, PAYMENT_SCHEDULED, PAID)`. Tudo o mais e "pendente" (nao entra) e e sinalizado separadamente no consolidado.
- Valor faturado de hora = `hours * Project.billingHourlyRate`. So existe quando o projeto tem `billingHourlyRate`; quando ausente, valor = null (exibe "-"). NUNCA derivar de `hourlyCost` do consultor (custo, fora de escopo desta rodada).
- Toda leitura assume banco configurado; caller guarda com `isDatabaseConfigured()`. Sem banco: `/app/relatorios` mostra banner "Modo demonstracao: banco nao configurado." e tabelas vazias (nao fingir dados); CSV retorna 503 `NO_DATABASE`.
- Consultor atual: `getConsultantForUser(user)` (fallback de email so em dev auth). Usuario sem `Consultant` com role apenas CONSULTANT: EmptyState "Seu usuario nao esta vinculado a um consultor."

## 2. Acesso a rota e matriz RBAC

`/app/relatorios` e acessivel a CONSULTANT (com escopo proprio). Justificativa:
o consultor ja ve as proprias horas/despesas em `/app/horas` e `/app/despesas`;
um relatorio filtravel/exportavel dos PROPRIOS dados nao expoe nada novo e
reduz pedidos manuais. Restringir so a gestao+finance nao agregaria seguranca
(o escopo proprio ja e o piso). Route map: `/app/relatorios` -> `"ALL"`. O
escopo real e aplicado por funcao de leitura no servidor (nao pela rota).

Escopo de leitura por role (resolvido em `resolveReportScope(user)`):

- CONSULTANT (sem outra role de gestao): SOMENTE os proprios dados (`consultantId` do `Consultant` vinculado). Aba Consolidado: visivel, mas restrita aos proprios itens (sem coluna monetaria de hora). Sem `Consultant` -> EmptyState.
- PROJECT_MANAGER: dados dos projetos que gerencia (`project.managerUserId === resolveDbUser(user).id`). Filtro de consultor opera dentro desse universo.
- AREA_MANAGER / ADMIN: escopo amplo (todos os clientes/projetos/consultores).
- FINANCE: escopo amplo de LEITURA para fechamento. Em HORAS, FINANCE ve apenas o necessario ao fechamento: somente horas `APPROVED` (e `CLOSED`), nunca `DRAFT/SUBMITTED/REJECTED` (escopo operacional que financeiro nao precisa). Em DESPESAS e CONSOLIDADO, FINANCE ve escopo amplo (toda a cadeia, pois acompanha aprovacao financeira e pagamento).

Resumo (linha = role, valor = escopo):

| Role            | Horas                                  | Despesas                | Consolidado            |
|-----------------|----------------------------------------|-------------------------|------------------------|
| CONSULTANT      | proprias (todos status)                | proprias (toda cadeia)  | proprias (sem $ hora)  |
| PROJECT_MANAGER | projetos que gerencia (todos status)   | idem projetos           | idem (sem $ hora)      |
| AREA_MANAGER    | amplo (todos status)                   | amplo                   | amplo (com $ hora)     |
| ADMIN           | amplo (todos status)                   | amplo                   | amplo (com $ hora)     |
| FINANCE         | amplo, SO APPROVED/CLOSED              | amplo (toda cadeia)     | amplo (com $ hora)     |

Regra de precedencia: usuario com multiplas roles recebe a UNIAO dos escopos (o mais amplo vence). Quem tem qualquer `FINANCIAL_ROLES` ve colunas monetarias de hora.

## 3. Protecao de billingHourlyRate e valores derivados

- Colunas monetarias de hora (`billingRate`, `billedAmount`) so aparecem para `FINANCIAL_ROLES` (ADMIN, AREA_MANAGER, FINANCE). PROJECT_MANAGER e CONSULTANT NUNCA veem essas colunas, nem na tela nem no CSV.
- A decisao e do SERVIDOR: `getHoursReport`/`getConsolidatedReport` recebem `includeFinancials: boolean` (derivado de `hasRole(user, FINANCIAL_ROLES)`); quando `false`, o `select` nao traz `project.billingHourlyRate` (defesa em profundidade) e o mapper omite os campos. O route handler de CSV recomputa `includeFinancials` a partir do user real, ignorando qualquer hint do client.
- Despesas ja sao valores de reembolso do consultor (nao receita); `amount` aparece para todos os perfis que tem escopo de leitura (inclusive CONSULTANT nas proprias). `Project.billingHourlyRate`, `budgetHours`, `costCenter`, `hourlyCost` do consultor NUNCA entram em nenhum CSV.

## 4. Filtros canonicos (compartilhados tela + CSV)

Schemas Zod em `apps/web/src/lib/reports/schemas.ts` (importados pela page e pelos route handlers; valores derivados de `searchParams`). Query params (todos opcionais, `coerce`/trim, ranges inclusivos):

- `from`, `to`: `yyyy-mm-dd` (regex + parse valido); `to >= from` via `superRefine` -> `INVALID_INPUT`.
- `clientId`, `projectId`, `consultantId`: cuid ou ausente. (`ALL` tratado como ausente.)
- HORAS `status`: enum `DRAFT | SUBMITTED | APPROVED | REJECTED | CLOSED` ou ausente (todos permitidos ao escopo). `activityType`: enum atual de `ActivityType` ou ausente.
- DESPESAS `status`: enum da cadeia de 8 (`DRAFT | SUBMITTED | MANAGER_APPROVED | MANAGER_REJECTED | FINANCE_APPROVED | FINANCE_REJECTED | PAYMENT_SCHEDULED | PAID`) ou ausente. `stage` (etapa): enum `GESTOR | FINANCEIRO | PAGAMENTO | FINALIZADA` ou ausente. Mapeamento etapa->status: GESTOR = {SUBMITTED, MANAGER_REJECTED}; FINANCEIRO = {MANAGER_APPROVED, FINANCE_REJECTED}; PAGAMENTO = {FINANCE_APPROVED, PAYMENT_SCHEDULED}; FINALIZADA = {PAID}. `status` e `stage` sao mutuamente refinados (se ambos vierem, `status` prevalece).
- CONSOLIDADO: `month` (`yyyy-mm`, expandido para `from`/`to` do mes em UTC) OU `from`/`to`; mais `clientId`, `projectId`, `consultantId`. Sem `status` (a semantica do consolidado define o que entra).

Schemas exportados: `hoursReportFilterSchema`, `expensesReportFilterSchema`, `consolidatedReportFilterSchema`. Cada um valida e devolve um objeto tipado consumido pela funcao de leitura.

## 5. Colunas e totais por relatorio

### 5.1 Relatorio de Horas

Colunas (tela e CSV): `date` (ISO), `weekLabel`, `consultantName`, `clientName`, `projectName`, `activity` (label pt-BR; valor cru se legado), `hours`, `billable` (Sim/Nao), `status` (label), `submittedAt` (ISO datetime ou vazio), `decidedAt` (data do ultimo Approval da entry, ou vazio). Apenas `FINANCIAL_ROLES`: `billingRate`, `billedAmount`.
Totais: total de horas; total de horas por status; total de horas por cliente->projeto; (FINANCIAL_ROLES) total faturado das horas APPROVED com `billingHourlyRate` definido. Contagem de entries.

### 5.2 Relatorio de Despesas

Colunas: `date`, `consultantName`, `clientName`, `projectName`, `description`, `invoiceNumber`, `amount`, `status` (label), `stage` (Gestor/Financeiro/Pagamento/Finalizada/Reprovada), `hasReceipt` (Sim/Nao), `lastDecision` (comentario do ultimo Approval, quando houver), `submittedAt` (ISO datetime ou vazio). NUNCA: `storageKey`, `storageBucket`, `fileName`, `uploadedByUserId`.
Totais: total por status; total aprovado financeiramente (FINANCE_APPROVED); total agendado (PAYMENT_SCHEDULED); total pago (PAID); soma geral. Reusa `summarizeExpenses` de `lib/expenses/types.ts`.

### 5.3 Consolidado/Fechamento

Agrupamento cliente -> projeto, duas secoes separadas (HORAS e DESPESAS) com totais proprios:

- Secao Horas: por projeto, horas APPROVED (entram), e (FINANCIAL_ROLES) valor faturado. Linha de "pendentes" por projeto: soma de horas nao-APPROVED (DRAFT+SUBMITTED+REJECTED), sinalizadas com tom warning e marcador `entraNoFechamento = false`.
- Secao Despesas: por projeto, total FINANCE_APPROVED + PAYMENT_SCHEDULED + PAID (entram), discriminados em aprovado/agendado/pago. Linha de "pendentes": despesas SUBMITTED/MANAGER_APPROVED (ainda nao chegaram ao financeiro) e reprovadas, marcadas `entraNoFechamento = false`.
- Totais do periodo: total horas aprovadas; (FINANCIAL_ROLES) total faturado; total despesas que entram; total pendente de cada secao (visivel mas separado). Itens pendentes NUNCA somam no total "que entra no fechamento".

## 6. Contrato CSV

Reutiliza o padrao de `buildMissingTimesheetCsv`: BOM UTF-8 (`﻿` prefixado), header estavel sempre presente (mesmo com zero linhas), `\r\n` entre linhas e ao final. Helpers puros em `apps/web/src/lib/reports/csv.ts` (testaveis sem rede):

- `csvField(value)`: sempre entre aspas, `"` duplicado (RFC 4180), cobre virgula/aspas/quebra de linha.
- Anti CSV injection: se a string (apos trim de aspas) comeca com `=`, `+`, `-`, `@`, TAB (`\t`) ou CR (`\r`), prefixar com apostrofo (`'`) ANTES de aplicar `csvField`. Regra aplicada a TODA celula de texto livre (description, comentario, nomes). Numeros/datas formatados pelo proprio gerador nao passam pelo prefixo.
- Datas: ISO `yyyy-mm-dd` (date-only) ou ISO datetime completo para `submittedAt/decidedAt`.
- Decimais: ponto como separador, 2 casas para dinheiro, ate 2 casas para horas (`12.50`). Booleanos como `Sim`/`Nao` (coerente com a tela pt-BR).
- Builders: `buildHoursCsv(rows, opts)`, `buildExpensesCsv(rows)`, `buildConsolidatedCsv(groups, opts)`. `opts.includeFinancials` controla as colunas monetarias de hora — quando `false`, os headers `billingRate`/`billedAmount` NEM aparecem no CSV.
- Nomes de arquivo (Content-Disposition `attachment`): `relatorio-horas_{from}_{to}.csv`, `relatorio-despesas_{from}_{to}.csv`, `consolidado_{period}.csv` (period = `month` ou `from_to`). Sem `from/to`, usar `tudo`.

## 7. Onde mora a query

Criar `apps/web/src/lib/db/reports.ts` (novo), reusando helpers existentes
(`getConsultantForUser`, `resolveDbUser`, `parseIsoDateUtc`, `weekLabel`,
`summarizeExpenses`, `activityLabelFor`). Motivo: a query de relatorio cruza
horas+despesas, aplica escopo amplo (gestao/finance) e colunas monetarias
opcionais — semantica diferente das leituras pessoais ja em `timesheet.ts`/
`expenses.ts`, que ficam focadas no proprio consultor/fila. Funcoes:

- `resolveReportScope(user): ReportScope` — `{ ownConsultantId?, managedOnly?, managerUserId?, broad: boolean, includeFinancials: boolean, financeHoursLimited: boolean }`. Pura sobre roles + `getConsultantForUser`/`resolveDbUser`.
- Filtros puros e testaveis (where Prisma montado a partir de escopo + filtros validados): `buildHoursWhere(scope, filter)`, `buildExpensesWhere(scope, filter)`.
- `getHoursReport(user, filter): { rows: HoursReportRow[]; totals }` — aplica escopo (FINANCE limitado a APPROVED/CLOSED), `select` estreito (sem `billingHourlyRate` quando `!includeFinancials`), `decidedAt` via Approval do entry.
- `getExpensesReport(user, filter): { rows: ExpensesReportRow[]; totals }`.
- `getConsolidatedReport(user, filter): { clients: ConsolidatedClient[]; totals }` — agrupa cliente->projeto, separa entra/pendente por secao.

Tipos de linha/totais em `apps/web/src/lib/reports/types.ts` (compartilhados UI + CSV; campos monetarios de hora opcionais).

## 8. Route handlers CSV

Tres `GET` em `apps/web/src/app/api/relatorios/{horas,despesas,consolidado}/route.ts`:

1. `requireUser()` (redireciona se nao autenticado; em API, 401/redirect padrao do guard).
2. `isDatabaseConfigured()` false -> 503 texto curto `NO_DATABASE`.
3. Validar `searchParams` com o schema Zod correspondente; invalido -> 400 `INVALID_INPUT`.
4. Resolver escopo + `includeFinancials` a partir do user REAL (ignorar qualquer flag do client).
5. Chamar a mesma funcao de leitura da tela; gerar CSV; responder `text/csv; charset=utf-8` + `Content-Disposition: attachment; filename="..."`. Sem cache (`Cache-Control: no-store`).

RBAC e escopo identicos a tela (mesma funcao de leitura) — impossivel exportar mais do que se ve.

## 9. Plano de arquivos

Novos:
- `apps/web/src/app/app/relatorios/page.tsx` (async; `requireUser`; segmento via `?tab=horas|despesas|consolidado`, default `horas`; branch demo/sem-consultor/real; le filtros de `searchParams`).
- `apps/web/src/components/reports/ReportsView.tsx` (abas/segmentos), `ReportFilters.tsx` (filtros canonicos, refletidos na query string), `HoursReportTable.tsx`, `ExpensesReportTable.tsx`, `ConsolidatedReport.tsx`, botao "Exportar CSV" (link para o route handler com os mesmos query params).
- `apps/web/src/lib/db/reports.ts`, `apps/web/src/lib/reports/{schemas.ts,types.ts,csv.ts}`.
- `apps/web/src/app/api/relatorios/horas/route.ts`, `.../despesas/route.ts`, `.../consolidado/route.ts`.

Alterados:
- `apps/web/src/lib/navigation.ts`: adicionar item "Relatorios" (icone `BarChart3` ou `FileText`), apos "Financeiro" ou antes (sugestao: depois de "Aprovacoes").
- `apps/web/src/lib/auth/route-permissions.ts`: adicionar regra `{ prefix: "/app/relatorios", access: "ALL" }` antes de `/app` (escopo real e por funcao de leitura).
- (Sub-rodada 4.5, fora do nucleo desta spec) badges do launcher com dados reais — manter como pendencia se nao couber.

## 10. Testes minimos

- Schemas Zod: `from > to` (`INVALID_INPUT`); status invalido por tipo; stage de despesa mapeando para o conjunto correto de status; `month` expandindo para o range UTC certo; cuids invalidos.
- `csv.ts`: BOM presente; header estavel com zero linhas; escaping de virgula/aspas/quebra de linha; injection (`=`, `+`, `-`, `@`, TAB) prefixada com apostrofo; `includeFinancials=false` omite colunas monetarias; decimais com ponto; datas ISO.
- `resolveReportScope`: CONSULTANT -> escopo proprio + `includeFinancials=false`; PROJECT_MANAGER -> `managerUserId`; FINANCE -> broad + `financeHoursLimited=true` + `includeFinancials=true`; ADMIN -> broad + financials; uniao de roles.
- `buildHoursWhere`/`buildExpensesWhere` (puros, Prisma mockado): CONSULTANT so o proprio `consultantId`; PROJECT_MANAGER so `project.managerUserId`; FINANCE em horas filtra `status in [APPROVED, CLOSED]` mesmo sem filtro explicito; filtros de cliente/projeto/periodo aplicados.
- `getHoursReport` sem `FINANCIAL_ROLES`: `select` nao traz `billingHourlyRate` e rows sem campos monetarios.
- Consolidado: itens pendentes (horas nao-APPROVED, despesas pre-financeiro) marcados `entraNoFechamento=false` e fora do total que entra; agrupamento cliente->projeto.
- Route handlers: sem banco -> 503; filtros invalidos -> 400; `includeFinancials` recomputado do user (flag do client ignorada); RBAC igual a tela (CONSULTANT exportando horas so traz as proprias).

## 11. Fora de escopo (rodada futura)

Modelo persistido de fechamento/competencia, lock de periodo, custo de hora
(`hourlyCost`) em relatorio, paginacao server-side de relatorios densos,
agendamento/envio automatico de relatorios por email, formatos XLSX/PDF.
