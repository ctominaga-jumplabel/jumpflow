# Phase 3 - Timesheet Summary

Data: 2026-06-13
Status: concluida

## Objetivo

Evoluir Horas para suportar filtros operacionais, periodo arbitrario com totais, visualizacao em calendario e lancamento diario/semanal persistido.

## Escopo Implementado

- Filtros de Horas agora aceitam `inicio` e `fim`, refletidos no contrato `TimesheetFilter`.
- `/app/horas` carrega a semana operacional e, em paralelo, um resumo do periodo selecionado.
- `getPeriodForConsultant` agrega:
  - total de horas do periodo;
  - totais por projeto apenas quando ha horas;
  - dias do calendario com entradas, status e tooltip.
- O periodo e limitado a 93 dias para evitar custo ilimitado de servidor/DOM.
- Quando apenas `inicio` e informado, o fim padrao passa a ser `inicio + 6 dias`.
- A tela de Horas exibe resumo do periodo, legenda por status e calendario responsivo.
- `TimeEntryForm` ganhou modo Diario/Semanal.
- `createWeeklyTimeEntries` cria entradas dia a dia com descricao replicada, respeitando:
  - usuario/consultor autenticado;
  - projeto nao encerrado;
  - alocacao ativa por dia;
  - duplicados por projeto/atividade/dia;
  - semana fechada;
  - envio imediato para aprovacao (`SUBMITTED`).
- O lancamento semanal nao cria `TimesheetPeriod` vazio quando todos os dias sao pulados.
- Modo demo espelha o lancamento semanal para manter a tela funcional sem banco.

## Arquivos Principais

- `apps/web/src/app/app/horas/page.tsx`
- `apps/web/src/app/app/horas/actions.ts`
- `apps/web/src/components/timesheet/TimeEntryForm.tsx`
- `apps/web/src/components/timesheet/TimesheetFilters.tsx`
- `apps/web/src/components/timesheet/TimesheetWeekView.tsx`
- `apps/web/src/lib/db/timesheet.ts`
- `apps/web/src/lib/timesheet/filters.ts`
- `apps/web/src/lib/timesheet/schemas.ts`
- Testes correspondentes em `*.test.ts` e `*.test.tsx`.

## Validacoes

- `npm exec --workspace @jumpflow/web -- vitest run src/components/timesheet/TimesheetWeekView.test.tsx src/components/timesheet/TimesheetFilters.test.tsx src/lib/timesheet/schemas.test.ts src/app/app/horas/actions.test.ts`: passou, 89 testes.
- `npm exec --workspace @jumpflow/web -- vitest run src/app/app/horas/actions.test.ts src/lib/db/timesheet.test.ts`: passou, 70 testes.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run build`: passou.
- `npm run test`: passou, 63 arquivos e 729 testes.
- `claude -p` review read-only da Fase 3: achados medios corrigidos antes do fechamento.

## Achados do Claude Corrigidos

- Periodo sem teto poderia gerar milhares de dias no servidor e no DOM.
- `inicio` sem `fim` usava o fim da semana visivel e podia gerar fallback enganoso.
- Lancamento semanal podia criar periodo vazio quando nenhum dia era criado.

## Pendencias / Observacoes

- O calendario mensal atual e uma visao operacional compacta, nao um calendario alinhado por coluna de dia da semana.
- A regra de edicao de `SUBMITTED` permanece conservadora: entries enviadas/aprovadas/fechadas nao sao editaveis pelo fluxo atual; reabertura/permissao fina deve ser tratada em fase posterior se o negocio exigir.
- A migration da Fase 2 ainda precisa ser aplicada em ambiente com banco real antes das fases que dependem das novas entidades.
