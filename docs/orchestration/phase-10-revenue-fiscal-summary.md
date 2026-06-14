# Fase 10 - Financeiro Receita e Base Fiscal

Data: 2026-06-14
Status: concluida

## Objetivo

Evoluir o modulo Financeiro para usar fechamento de receita real a partir de horas aprovadas, com maquina de estados auditada e base fiscal/NFS-e abstraida.

## Entregas

- `/app/financeiro` passa a carregar `RevenueClosing` real quando o banco esta configurado, mantendo fallback demo.
- Geracao/recalculo mensal cria ou atualiza fechamentos por projeto a partir de `TimeEntry` aprovado e faturavel.
- Valor de venda usa a precedencia da Fase 7: alocacao, consultor, projeto, fallback do projeto e fallback do cliente.
- Transicoes auditadas: `OPEN -> IN_REVIEW -> READY_TO_CLOSE -> CLOSED -> INVOICED`.
- `MARK_INVOICED` exige `FiscalDocument` emitido.
- Rascunho de NFS-e (`FiscalDocument`) pode ser preparado para fechamento fechado.
- Provider NFS-e foi abstraido em `lib/nfse/provider.ts`; default e desabilitado, com erro honesto.
- UI financeira exibe status de fechamento, valor medio, documento fiscal e acoes operacionais.
- Smoke test passou a mockar actions financeiras para preservar boundary server/client no Vitest.

## Arquivos Alterados

- `apps/web/src/app/app/financeiro/page.tsx`
- `apps/web/src/app/app/financeiro/actions.ts`
- `apps/web/src/components/financial/FinancialOverview.tsx`
- `apps/web/src/components/financial/MonthlyClosingTable.tsx`
- `apps/web/src/components/modules-smoke.test.tsx`
- `apps/web/src/lib/db/revenue.ts`
- `apps/web/src/lib/db/revenue.test.ts`
- `apps/web/src/lib/financial/types.ts`
- `apps/web/src/lib/financial/types.test.ts`
- `apps/web/src/lib/nfse/provider.ts`
- `apps/web/src/lib/nfse/provider.test.ts`

## Decisoes

- O escopo ficou em fechamento por projeto; fechamento somente por cliente continua deferido por causa de `projectId` nulo em unique composta.
- Integracao real com Prefeitura/SP, XML assinado, PDF e email automatico ficaram deferidos para provider real.
- Auditoria da geracao mensal roda dentro da mesma transacao que cria/atualiza fechamentos e linhas.
- Criacao de rascunho fiscal reaproveita NFS-e nao cancelada existente para evitar duplicidade por clique repetido.

## Validacoes

- `npm exec --workspace @jumpflow/web -- vitest run src/lib/financial/types.test.ts src/lib/db/revenue.test.ts src/lib/nfse/provider.test.ts`: passou, 3 arquivos e 4 testes.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 72 arquivos e 755 testes.
- `npm run build`: passou.
- `claude -p` review read-only da Fase 10: GO.
- `claude -p` recheck apos hardening: GO.

## Limitacoes

- Fluxo para `ISSUED` ainda depende de provider real ou action futura de registro manual de emissao.
- Clique concorrente extremo ainda pode duplicar rascunho fiscal sem um indice unico especifico por `revenueClosingId`.
- Recaculo nao zera automaticamente fechamentos existentes quando todas as horas aprovadas de um projeto somem.
