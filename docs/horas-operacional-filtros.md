# Horas - Paridade Operacional (Rodada 4.2)

Spec da Rodada 4.2: alinhar o catalogo de atividades e os filtros visiveis da
tela `/app/horas` ao portal antigo, preservando o design JumpFlow, a grade
semanal e o RBAC server-side. Mesmo formato das specs anteriores
(`docs/horas-persistencia.md`, `docs/relatorios-fechamento.md`).

## 1. Confirmacao do legado (4.2.0)

Catalogo de atividades e filtros vieram do print do modulo "Apontamento de
horas" (em `docs/image/`) e de `docs/mapeamento-filtros-portal-antigo.md`. O
portal antigo usa Microsoft OAuth/MFA; sem sessao interativa nao foi possivel
confirmar atividades inativas alem das do print. Limitacao registrada; seguir
com o catalogo do print. Nenhuma credencial impressa/commitada.

## 2. Catalogo de atividades (4.2.1)

Novo catalogo canonico (`ACTIVITY_TYPES` em `lib/timesheet/types.ts`), na ordem
do form, default `WORKDAY`:

| Valor | Label |
| --- | --- |
| `WORKDAY` | Dia Util |
| `WAITING_PROJECT_START` | Aguardando inicio no projeto |
| `VACATION` | Ferias |
| `LEAVE` | Licenca |
| `ABSENCE` | Ausencia / Falta |
| `DAY_OFF` | Folga |
| `PAID_ABSENCE` | Ausencia Remunerada |
| `ON_CALL` | Sobreaviso |

### Compatibilidade com dados antigos

- `TimeEntry.activityType` ja e `String` no Prisma -> NENHUMA migration.
- Valores legados (`DEVELOPMENT`, `MEETING`, `DISCOVERY`, `SUPPORT`, `DOCS`)
  NAO entram em `ACTIVITY_TYPES`, mas ganham labels num mapa separado
  `DEPRECATED_ACTIVITY_LABELS` para continuarem renderizando.
- Helper unico `activityLabelOf(value: string): string` =
  `activityLabels[value] ?? DEPRECATED_ACTIVITY_LABELS[value] ?? value`
  (fallback cru para qualquer valor desconhecido). Usado na tela de Horas, nos
  relatorios (`lib/db/reports.ts`, hoje `activityLabelFor`) e na fila.
- `isActivityType` continua validando apenas o catalogo canonico (form/filtros).
- `TimeEntryRow.activity` passa de `ActivityType` para `string` (aceita valores
  legados sem coercao incorreta); a UI usa `activityLabelOf`. O form so oferece
  o catalogo novo.
- Seeds/mock-data passam a usar o catalogo novo em dados futuros; fixtures com
  valores antigos ficam SOMENTE em testes de compatibilidade.

## 3. Filtros de `/app/horas` (4.2.2 / 4.2.3)

Bloco "Filtros" visivel acima da grade (form GET, query string = fonte de
verdade), inspirado no legado com UX JumpFlow. Parametros:

- `semana` (ja existe): unidade primaria. Mantida.
- `data` (atalho): input de data que navega para a semana que contem a data
  (`?semana=<weekStartOf(data)>`), sem listar o mes na grade.
- `projectStatus`: `Project.status` (`PROPOSAL|ACTIVE|PAUSED|CLOSED`).
- `projectId`: projeto (lista do escopo do consultor na semana).
- `activity`: catalogo canonico (`ACTIVITY_TYPES`).
- `status`: status do lancamento (`DRAFT|SUBMITTED|APPROVED|REJECTED|CLOSED`).
- `billable`: `true|false|ausente` (todos/sim/nao) — equivalente a `cobranca`.
- `sort`: whitelist `project|activity|status|date` (default `project`).
- `direction`: `asc|desc` (default `asc`).
- Itens por pagina: OMITIDO. A grade e de uma semana (poucas linhas:
  projeto x atividade x status); um controle de paginacao seria inerte.
  Justificativa registrada aqui em vez de um controle morto.

### Schema e tipo

- `TimesheetFilter` + `timesheetFilterSchema` (Zod) em
  `lib/timesheet/filters.ts`. `sort`/`direction`/`status`/`activity`/
  `projectStatus`/`billable` validados por enum (valor invalido -> ignorado com
  fallback seguro na pagina; nas rotas/acoes sensiveis o schema rejeita).
- `blankToUndefined`/`ALL`-as-absent como em `lib/reports/schemas.ts`.

### Aplicacao

- Modo db: filtros aplicados NO SERVIDOR em `getWeekForConsultant(consultantId,
  weekStart, filter)` (where por `status`/`activityType`/`billable`/`projectId`
  e `project.status`; ordenacao das linhas por `sort`/`direction`).
  `listAllowedProjects` aceita `projectStatus` quando usado para a lista do
  filtro de projeto.
- Modo demo: filtros aplicados no client/local state com o MESMO contrato
  visual (mesmos controles, mesma query string refletida).
- Os filtros apenas REDUZEM o que o usuario ve. Criar/editar/enviar/copiar
  continuam validando alocacao ativa no servidor (a regra de alocacao NAO e
  afetada por filtro). Acoes preservam os filtros atuais na navegacao quando
  possivel (revalidatePath mantem a query; o form de filtro e GET).
- Nenhum campo financeiro exposto (sem `billingHourlyRate`).

## 4. UI/UX (4.2.4)

- Bloco "Filtros" denso e escaneavel, consistente com Playful Ops, responsivo.
- Filtros essenciais aparentes (o objetivo e torna-los visiveis); pode usar
  disclosure apenas para os secundarios (`sort`/`direction`/`billable`) se a
  densidade pedir, mas Status/Projeto/Atividade ficam visiveis.
- Usuario percebe: quais filtros estao ativos, como limpar (link "Limpar" que
  preserva apenas `semana`), e que a semana segue sendo a unidade principal
  (cabecalho da semana + navegacao previa/proxima permanecem).
- Sem landing/texto explicativo longo.

## 5. Fora de escopo

- Copiar a UI visual antiga; listagem mensal substituindo a grade semanal;
  alteracao em massa; faturamento/liberacao; migration de
  contratacao/tipo-projeto/facilities; auth real; storage.

## 6. Testes minimos (4.2.5)

- Catalogo: `ACTIVITY_TYPES` novo; `activityLabelOf` para canonico, legado e
  valor desconhecido (cru).
- Form: default `WORKDAY`.
- Schema: `timesheetFilterSchema` aceita validos, ignora/rejeita invalidos;
  `sort` fora da whitelist nao vira coluna crua; `billable` true/false/ausente.
- `getWeekForConsultant` com filtro: reduz linhas por status/projeto/
  projectStatus/atividade/billable; ordena por sort/direction; sem filtro =
  comportamento atual.
- `listAllowedProjects` com `projectStatus`.
- Navegacao: `data` -> `?semana=` da semana correta.
- Modo demo: filtros aplicam no local state; modo db: no servidor.
- Compat: linha com atividade legada renderiza label legivel e e filtravel.
- Relatorios/CSV (Rodada 4/4.1) continuam verdes (catalogo novo no enum de
  atividade dos relatorios; labels legados ainda renderizam).
