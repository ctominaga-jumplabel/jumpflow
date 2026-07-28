# Proposta — Cockpit do Gestor de Área

> Idealização (2026-07-27). Tela única que centraliza o acompanhamento de horas por
> projeto e as duas liberações (Financeiro e DP) para o Gestor de Área.
> Documento de produto — ainda sem implementação.

## 1. Visão

Hoje o Gestor de Área percorre três telas separadas para fechar o mês de um projeto:

- **Consulta de horas** (`HorasConsultaPanel` na tela Horas, `HoursReportTable` em Relatórios) — para ver o que os consultores lançaram.
- **Pendentes de Fechamento** (`PendingClosingsView`) — para liberar o faturamento (Financeiro).
- **Fechamento Operacional** (`OperationClosingTable`) — para liberar para o DP.

Os dois eixos de liberação são **independentes no banco** (`RevenueClosing.status` vs.
`OperationClosing.status`) e nunca aparecem cruzados num único lugar. O cockpit resolve
isso: passa a ser o ponto único onde o gestor vê, por projeto e por consultor, **o que
ainda falta** e libera as duas pontas.

**Decisão de escopo:** o cockpit **unifica e substitui** Pendentes de Fechamento +
Fechamento Operacional. Vira a home operacional do Gestor de Área. As telas antigas
permanecem acessíveis por deep-link durante a transição, mas o menu passa a apontar para o
cockpit.

## 2. Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Cockpit do Gestor de Área          [ Competência: Julho/2026 ▼ ]      │
│  ─────────────────────────────────────────────────────────────────    │
│  [ Ativos ]   [ Histórico ]                        (FinanceTabs)       │
│                                                                        │
│  ▸ Projeto Alpha — Cliente X          Fin: ⏳  DP: ⏳    [obrig.diária ✓]│
│  ▾ Projeto Beta  — Cliente Y          Fin: ✅  DP: ⏳    [obrig.diária ✓]│
│      Consultor            Sem lanç.  Pendentes   [📅]                   │
│      ─────────────────────────────────────────────                    │
│      Ana Martins             2          3        [📅 calendário]        │
│      João Souza              0          0        [📅 calendário]        │
│                                                                        │
│      [ Liberar Financeiro ]   [ Liberar DP ]                           │
└──────────────────────────────────────────────────────────────────────┘
```

- **Aba Ativos**: projetos `ACTIVE` que ainda têm pelo menos uma liberação pendente na
  competência selecionada.
- **Aba Histórico**: projetos cuja competência já está liberada **nos dois eixos**
  (`RevenueClosing CLOSED` **E** `OperationClosing CLOSED`). Corresponde ao item 1.1.4.
- **Seletor de competência**: mês, default mês atual (mesmo padrão de Contas a Receber).
  Toda a contagem e as liberações são por competência.

## 3. Como cada item do roteiro original se traduz

| Item | Tradução técnica |
|------|------------------|
| 1. Projetos ativos | `Project.status = ACTIVE`, uma linha (accordion) por projeto |
| 1.1 Dropdown de consultores | `Allocation` com `status=ACTIVE` e vigente na competência (não `ConsultantProjectRate`) |
| 1.1.1 Dias sem lançamento | dias úteis do mês − sábados/domingos − `Holiday` (respeitando `HolidayProject`) − dias com `TimeEntry` |
| 1.1.1 Dias com pendente | dias com `TimeEntry.status = SUBMITTED` (não existe "PENDING"; pendente = SUBMITTED) |
| 1.1.1.1 Botão calendário | drawer com grade do mês; cada dia pintado: aprovado / pendente / vazio / feriado / fim de semana |
| 1.1.2 Liberar Financeiro | action existente `fecharApuracao` (justificativa obrigatória; dispara `HOURS_RELEASED`) |
| 1.1.3 Liberar DP | action existente `closeOperation` (exige todos APPROVED; dispara `OPERATION_CLOSED`→DP) |
| 1.1.4 Vai para Histórico | ambos os `*Closing` em `CLOSED` para o projeto+mês |
| 1.2 Flag obrigatoriedade diária | **campo novo** `Project.dailyEntryRequired` (default `true`) |

## 4. Estados e regras dos botões

Os dois eixos são independentes e têm gates diferentes — a UI precisa deixar claro por que
um botão está bloqueado.

**Liberar Financeiro** (`fecharApuracao`, RBAC `[ADMIN, AREA_MANAGER]`)
- Requer justificativa (já é obrigatória na action).
- Não exige aprovação prévia das horas.
- Resultado: `RevenueClosing → CLOSED`, evento `HOURS_RELEASED`, auditoria
  `RECEIVABLES_APURACAO_CLOSED`.

**Liberar DP** (`closeOperation`, permissão `OPERACAO_FECHAMENTO edit = [AREA_MANAGER, PROJECT_MANAGER]`)
- **Bloqueado até todos os consultores alocados estarem `APPROVED`** (`getOperationReadiness.canClose`).
  O cockpit deve mostrar o motivo (ex.: "3 lançamentos pendentes de aprovação").
- Resultado: `OperationClosing → CLOSED`, snapshot dos consultores, evento
  `OPERATION_CLOSED` → DP (ROLE PEOPLE).

Chips de status por projeto: `Fin: ⏳/✅` e `DP: ⏳/✅`. Quando ambos ✅ → move para
Histórico automaticamente (revalidate).

## 4.1 Regras de bloqueio de lançamento e edição (travas)

Motivação real do fluxo separado: o **Financeiro** libera o faturamento **antes** do DP
fechar, porque o cliente precisa ser faturado no prazo e os consultores lançam
antecipadamente. O DP fecha alguns dias depois. Para que o valor faturado não divirja do
que foi lançado, o lançamento precisa ser **congelado** no momento da liberação financeira.

### Trava A — Lançamento congelado após liberação para o Financeiro

- Quando existe `RevenueClosing.status = CLOSED` para (projeto, competência), o consultor
  **não pode lançar nem editar** horas daquele projeto naquela competência.
- **Reabertura:** somente se o Financeiro **retornar a liberação** ao Gestor de Área
  (reverter `RevenueClosing` de `CLOSED` para um estado anterior). Isso reabre o lançamento
  para os consultores e **notifica o Gestor de Área**.
- Base existente: já há máquina de estados reversível em `advanceRevenueClosing`
  (transições reversas / "voltar status") e a jornada de reabertura auditada. A trava é uma
  **checagem nova no ponto de escrita do lançamento** (server action de horas), cruzando
  competência do lançamento com a existência de `RevenueClosing CLOSED`.

### Trava B — Edição congelada após aprovação

- O consultor só edita um `TimeEntry` enquanto ele **não** estiver `APPROVED`.
- Para editar um lançamento já `APPROVED`, a **aprovação precisa ser revertida** primeiro
  (retorna para `SUBMITTED`/`DRAFT`, re-entra na fila de aprovação), com auditoria.
- **Decisão (quem reverte): só o gestor.** Mantém a segregação de deveres existente. O
  consultor não reverte a própria aprovação; ele apenas **solicita reabertura** (botão na UI
  de horas), e o gestor usa o fluxo já existente `decideHours` (decision `SUBMITTED`) para
  reverter `APPROVED → SUBMITTED` (auditado, re-entra na fila). Backend já pronto; falta só o
  botão de solicitação (Fase 4).
- Precedência: a Trava A tem prioridade sobre a Trava B — se o Financeiro já liberou, nem a
  reversão de aprovação reabre a edição; é preciso primeiro o Financeiro retornar a liberação.

### Ordem das travas (do mais restritivo ao mais livre)

```
RevenueClosing CLOSED  → lançamento/edição BLOQUEADOS (só Financeiro reabre)
       ↓ (Financeiro retorna liberação)
TimeEntry APPROVED      → edição BLOQUEADA (reverter aprovação para editar)
       ↓ (reabrir para edição)
SUBMITTED / DRAFT       → edição livre pelo consultor
```

Impacto na UI de horas do consultor: os dias travados aparecem com cadeado e tooltip
explicando o motivo ("Faturamento liberado — contate o Gestor de Área" / "Aprovado —
reabra para editar").

## 5. Flag de obrigatoriedade diária (item 1.2)

**Estado atual:** não existe controle por projeto. Só há o global
`AutomationConfig.requiredDailyMinutes = 480`.

**Proposta:**
- Novo campo `Project.dailyEntryRequired Boolean @default(true)` (+ migration).
- Editável por `AREA_MANAGER` e `PROJECT_MANAGER` (toggle no cabeçalho do projeto no cockpit).
- `true` (nasce assim): o projeto entra na **cobrança semanal** (motor
  `MISSING_TIMESHEET_REPORT`) e "dias sem lançamento" conta como pendência cobrável.
- `false`: sem cobrança semanal e sem indicação de pendência; mantém apenas o **indicador
  informativo** "consultor não fez nenhum lançamento" (sem alarme).
- Alteração da flag deve ser auditada (`AuditEvent`), por ser regra operacional.

## 6. O que reaproveita (não reconstruir)

- Cascas/abas: `FinanceTabs`, `PageHeader`, `SectionPanel`, `EmptyState`, `StatusBadge`.
- Tabela: `DataTable` / `DataTableColumn`; métricas: `MetricCard`, `StatTile`.
- Feriados: `lib/timesheet/holidays.ts`, `lib/db/holidays.ts`.
- Liberações: `fecharApuracao`, `closeOperation` (nenhuma mudança de backend nas actions).
- Leitura de horas: lógica de `lib/db/reports.ts` / `HorasConsultaPanel`.
- Prontidão DP: `getOperationReadiness` (`lib/db/operation-closing.ts`).
- Classificação de liberado: `classifyPendingStatus` (`lib/financial/receivables-journey-core.ts`).

## 7. O que é genuinamente novo

1. **Campo** `Project.dailyEntryRequired` + migration.
2. **Agregação por projeto→consultor→competência**: função pura que, dado projeto + mês,
   devolve por consultor { diasSemLancamento, diasPendentes, prontidaoDP }. Testável isolada.
3. **Cruzamento dos dois eixos** para decidir Ativos vs. Histórico.
4. **UI do cockpit** (accordion + drawer de calendário).
5. **Rota** nova (ex.: `/app/operacao/cockpit` ou home do Gestor) + entrada de menu +
   RBAC (`AREA_MANAGER`, `PROJECT_MANAGER`, `ADMIN`; `FINANCE` puro **não** entra).

## 8. Fora de escopo (por ora)

- Reabertura de liberação a partir do cockpit (continua nas telas de origem via link).
- Cobrança automática nova — reusa o motor existente, não cria canal novo.
- Exceção de obrigatoriedade por consultor/alocação (flag é por projeto).

## 9. Backlog faseado de desenvolvimento

Fases sequenciais (cada uma depende da anterior). Dentro de uma fase, tarefas sem conflito
de arquivo podem correr em paralelo; escritores no mesmo módulo são serializados.

### Fase 0 — Especificação & verificação de comportamento atual
- Formalizar histórias e critérios de aceite (inclui Travas A/B e decisão "quem reverte").
- Verificar no código: como o lançamento/edição são travados hoje; se `advanceRevenueClosing`
  já suporta reverter `CLOSED`; se editar `APPROVED` já é bloqueado.
- **Agentes:** `jump-product-owner` (+ verificação via leitura de código).
- **Saída:** critérios de aceite fechados; lista de gaps reais vs. já existentes.

### Fase 1 — Modelo de dados
- Campo novo `Project.dailyEntryRequired Boolean @default(true)` + migration.
- Confirmar que as Travas A/B **não** exigem schema novo (usam status existentes).
- **Agentes:** `jump-data-modeler`.
- **Gate humano:** aplicar migration em prod é manual (`db:deploy` pelo usuário).

### Fase 2 — Regras de negócio (backend)

> Achados da Fase 0 (verificação de código):
> - **Trava B já existe** no essencial: `updateTimeEntry` bloqueia `APPROVED`/`CLOSED`
>   (`NOT_EDITABLE`, `apps/web/src/app/app/horas/actions.ts` L679-690); `deleteTimeEntry`
>   idem (L862). Reverter aprovação existe via `decideHours` (decision `SUBMITTED` = reopen,
>   L1398), **mas só para `[ADMIN, AREA_MANAGER, PROJECT_MANAGER]`**, com segregação de
>   deveres (PM não decide as próprias horas).
> - **Retorno da liberação já existe**: `advanceRevenueClosing` transição `REOPEN`
>   (`CLOSED → READY_TO_CLOSE`, `lib/db/revenue.ts`), RBAC `FINANCIAL_ROLES`, justificativa
>   obrigatória, bloqueia se houver NFS-e; `INVOICED` é imutável.
> - **Trava A é o gap real**: `horas/actions.ts` não tem NENHUMA checagem de
>   `RevenueClosing`/`OperationClosing`. Fechar operação hoje não altera `TimeEntry.status`.

- **2a — Trava A (GAP NOVO):** guarda central nova (análoga a `upsertOpenPeriod`/
  `assertNoConfirmedTimeOff`) que, dado `projectId` + data, bloqueia mutação se a competência
  tiver `RevenueClosing` em `CLOSED`/`INVOICED`. Cabear nos pontos de mutação:
  `createTimeEntry`, `createWeeklyTimeEntries`, `updateTimeEntry` (cuidar mudança de mês),
  `deleteTimeEntry`, `applyTimesheetDefault`, `copyPreviousWeek`. `jump-timesheet-agent`.
- **2b — Trava B (AJUSTE):** o bloqueio já existe; o único gap é a decisão "quem reverte a
  aprovação" (ver Fase 0). Se for self-service do consultor, estender `decideHours`/nova
  action para o dono reabrir a própria hora `APPROVED → SUBMITTED` (auditado, re-entra na
  fila), respeitando que a Trava A tem precedência. `jump-timesheet-agent`.
- **2c — Retorno da liberação (AJUSTE):** `REOPEN` já existe; gap = **notificar o Gestor de
  Área** ao reabrir e garantir que a reabertura destrava o lançamento (automático, pois o
  status deixa de ser `CLOSED`). `jump-finance-ops-agent`.
- **2d — Engine de agregação (GAP NOVO):** função pura projeto→consultor→competência (dias
  sem lançamento, pendentes, prontidão DP). `jump-fullstack-engineer`.
- 2c corre em paralelo a 2a/2b (módulos distintos); 2a/2b serializados (mesmo arquivo).

### Fase 3 — Automação & flag
- Ligar `dailyEntryRequired` à cobrança semanal (`MISSING_TIMESHEET_REPORT`); auditar mudança de flag.
- **Agentes:** `jump-workflow-automation`.

### Fase 4 — Rota, RBAC e UI
- **4a** Rota nova + RBAC + entrada de menu; repontar Pendentes/Fechamento para o cockpit (deep-links preservados). `jump-operational-launcher-agent`.
- **4b** UI do cockpit: abas Ativos/Histórico, accordion de projetos, linha de consultor, chips, botões de liberação com motivo de bloqueio. `jump-frontend-ux`.
- **4c** Drawer de calendário por consultor/mês. `jump-frontend-ux`.
- **4d** Cadeado/tooltip nos dias travados na tela de horas do consultor. `jump-frontend-ux`.
- **4e** Acabamento premium/Motion. `jump-design-system`.

### Fase 5 — Testes & validação
- Unit do engine de agregação e das travas (A tem precedência sobre B; reabertura reabre corretamente).
- Integração das server actions (RBAC, idempotência, auditoria).
- **Agentes:** `jump-qa-engineer`.

### Fase 6 — Revisão final
- Revisão de código, regressão, permissões, dados e testes faltantes.
- **Agentes:** `jump-code-reviewer`.

### Fase 7 — Deploy (gate humano)
- `db:deploy` da migration + `vercel --prod` são **manuais** pelo usuário (regra do projeto).
- **Agentes:** `jump-devops` (apenas instruções/checagem; não publica).

## 10. Análise de suficiência dos agentes

**Conclusão: os agentes existentes cobrem 100% do desenvolvimento, teste e validação — não é preciso criar agente novo.**

| Necessidade | Agente | Suficiente? |
|---|---|---|
| Escopo, histórias, critérios | `jump-product-owner` | ✅ |
| Schema + migration | `jump-data-modeler` | ✅ |
| Travas de lançamento/edição, reabrir p/ edição | `jump-timesheet-agent` | ✅ (domínio exato) |
| Retorno da liberação (RevenueClosing) | `jump-finance-ops-agent` / `jump-billing-agent` | ✅ |
| Engine de agregação, server actions | `jump-fullstack-engineer` | ✅ |
| Flag → cobrança semanal, notificações, auditoria | `jump-workflow-automation` | ✅ |
| Rota, RBAC, menu, home por papel | `jump-operational-launcher-agent` | ✅ |
| UI, accordion, drawer, cadeados | `jump-frontend-ux` | ✅ |
| Acabamento/Motion | `jump-design-system` | ✅ |
| Testes unit/integração | `jump-qa-engineer` | ✅ |
| Revisão final | `jump-code-reviewer` | ✅ |
| Deploy/ambiente (gate humano) | `jump-devops` | ✅ (não publica sozinho) |

Sem lacuna funcional. Os únicos gates **não automatizáveis** são aplicar migration em
produção e o deploy Vercel — ambos manuais por decisão do projeto.

## 12. Status de implementação (2026-07-28)

Implementado na branch `feat/cockpit-gestor-area` (NÃO commitado, NÃO deployado). Todas as
fases 0–6 concluídas; gates `typecheck` + `next build` verdes; 36 testes unitários passando.

- Fase 1: `Project.dailyEntryRequired` + migration `20260727120000` (aplicar em prod é gate humano).
- Fase 2: Trava A (guarda `billing-lock.ts` cabeada em create/weekly/update/delete/applyDefault/
  copyPreviousWeek **e submitWeek** após correção A1); Trava B já existia (só falta botão de
  solicitação — feito); retorno da liberação notifica o Gestor no REOPEN; engine de agregação.
- Fase 3: cobrança semanal respeita a flag; action de toggle auditada.
- Fase 4: rota `/app/operacao/cockpit`, RBAC, menu, UI (CockpitView + calendário), cadeados na
  tela de horas, botão "Solicitar reabertura", acabamento (Motion + acessibilidade).

### Achados da revisão (Fase 6)
- **A1 (Alto) — CORRIGIDO:** `submitWeek` furava a Trava A; agora pula competências liberadas por dia.
- **M1 (Médio) — CORRIGIDO:** cadeado por linha na virada de mês; agora por dia/coluna.
- **B1 (Baixo) — DECIDIDO:** o PM VÊ TODOS os projetos ativos (mantém o comportamento atual,
  consistente com `getOperationClosingOverview`). Sem mudança de código.
- **B3 (aceito):** reuso de `NotificationEvent` existentes (HOURS_RELEASED no REOPEN;
  MISSING_TIMESHEET_REPORT no pedido de reabertura) por schema fora de escopo — criar eventos
  próprios quando houver migration.

### Follow-ups recomendados (não bloqueiam)
- Testes de comportamento das actions (submitWeek travado, requestEntryReopen ownership,
  setProjectDailyEntryRequired segregação PM, notifyRevenueClosingReopened só no REOPEN).
- Fase 4 final: repontar/ocultar menu antigo (Pendentes/Fechamento) para o cockpit.
- Decisão B1 (escopo de leitura do PM).

## 11. Plano de orquestração

- Execução **sequencial por fase** (dependências de arquivo); paralelismo só entre tarefas
  que tocam módulos distintos (ex.: 2c financeiro vs. 2a/2b horas).
- Branch de trabalho: `feat/cockpit-gestor-area` (a partir de `main`).
- Entre fases, revisar a saída de cada agente antes de liberar a próxima.
- Pausas obrigatórias nos gates humanos (Fase 1 migration, Fase 7 deploy).
- Fecho com `jump-code-reviewer` (Fase 6) antes de qualquer merge.
