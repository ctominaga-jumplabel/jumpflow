# Phase 7 - Projects And Sale Rates Summary

Data: 2026-06-14
Status: concluida

## Objetivo

Evoluir Projetos para leitura persistida, CRUD operacional, vinculos de consultores/skill-papel e valores de venda por vigencia, alimentando faturamento com RBAC comercial.

## Escopo Implementado

- `/app/projetos` passa a usar dados reais quando o banco esta configurado e modo demo quando nao ha banco.
- Nova `ProjectsView` operacional com:
  - filtros por busca, status e cliente;
  - criacao/edicao de projeto;
  - detalhe de vinculos de consultores;
  - detalhe de valores de venda por vigencia.
- Server actions para:
  - `createProject`;
  - `updateProject`;
  - `createAllocation`;
  - `updateAllocation`;
  - `createSaleRate`;
  - `updateSaleRate`.
- Valores de venda usam `ProjectSaleRate` com escopos:
  - projeto;
  - projeto + consultor;
  - alocacao.
- Resolucao de valor de venda segue precedencia:
  - alocacao;
  - consultor;
  - projeto;
  - fallback `Project.billingHourlyRate`;
  - fallback `Client.defaultHourlyRate`.
- Validacao de sobreposicao usa intervalo semiaberto `[inicio, fim)` e bloqueia overlap apenas dentro do mesmo escopo.
- `createSaleRate`/`updateSaleRate` validam que a alocacao pertence ao projeto informado.
- `consultantId` e `allocationId` de sale rate aceitam apenas CUIDs e nao podem ser enviados juntos.
- `lib/db/reports.ts` passou a calcular valores faturados por `ProjectSaleRate` quando `includeFinancials` e verdadeiro, mantendo fallback legado.
- Campos comerciais/financeiros de projetos sao filtrados no servidor quando o papel nao pode ver.
- `SALES`, `FINANCE`, `AREA_MANAGER` e `ADMIN` podem ver/cadastrar valores de venda; relatorios financeiros continuam restritos a `FINANCIAL_ROLES`.

## Arquivos Principais

- `apps/web/src/app/app/projetos/page.tsx`
- `apps/web/src/app/app/projetos/actions.ts`
- `apps/web/src/components/projects/ProjectsView.tsx`
- `apps/web/src/components/projects/ProjectsView.test.tsx`
- `apps/web/src/components/projects/ProjectSummaryPanel.tsx`
- `apps/web/src/components/projects/ProjectStatusBadge.tsx`
- `apps/web/src/lib/db/projects.ts`
- `apps/web/src/lib/db/reports.ts`
- `apps/web/src/lib/db/reports.test.ts`
- `apps/web/src/lib/projects/types.ts`
- `apps/web/src/lib/projects/schemas.ts`
- `apps/web/src/lib/projects/mock-data.ts`
- `apps/web/src/lib/projects/rates.ts`
- `apps/web/src/lib/projects/rates.test.ts`

## Validacoes

- `npm exec --workspace @jumpflow/web -- vitest run src/components/projects/ProjectsView.test.tsx src/lib/projects/rates.test.ts src/components/projects/ProjectList.test.tsx src/lib/db/reports.test.ts`: passou, 50 testes.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 66 arquivos e 745 testes.
- `npm run build`: passou.
- `claude -p` review read-only da Fase 7: GO.
- `claude -p` recheck read-only apos refinamentos: GO.

## Achados do Claude Corrigidos

- `consultantId` de sale rate avulso agora valida existencia.
- `managerName` agora e carregado em batch no read layer real.
- `consultantId`/`allocationId` de sale rate agora usam CUID opcional e nao aceitam ambos simultaneamente.

## Pendencias / Observacoes

- A protecao contra sobreposicao concorrente ainda e aplicacional. Para garantia forte em alta concorrencia, avaliar exclusion constraint PostgreSQL ou transacao serializable.
- `SALES` ve campos comerciais de projeto, incluindo valor hora legado, budget e cost center; decisao alinhada ao aceite de cadastro comercial de valores de venda, mas pode ser refinada por PO.
- `Skill do vinculo` foi implementado como texto `Allocation.role`, coerente com o schema atual; FK para catalogo de Skills fica para evolucao posterior.
- A migration da Fase 2 ainda precisa ser aplicada em ambiente com banco real.

