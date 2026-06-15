# Phase 6 - Clients And Billing Types Summary

Data: 2026-06-13
Status: concluida

## Objetivo

Implementar cadastro de clientes e tipos de cobranca, com CNPJ via provider abstraction e protecao de campos financeiros/fiscais por role.

## Escopo Implementado

- Nova rota `/app/clientes` com pagina operacional de clientes.
- Navegacao principal inclui `Clientes`.
- Acesso a `/app/clientes` exige papel de negocio (`ADMIN`, `AREA_MANAGER`, `FINANCE` ou `SALES`).
- Cliente cobre:
  - nome;
  - logo URL;
  - CNPJ;
  - status;
  - tipo de cobranca;
  - valor hora, mensalidade e limite de horas;
  - regra de arredondamento;
  - dia de faturamento e vencimento;
  - tipo de nota, municipio, ISS e regras fiscais.
- Subtela de tipos de cobranca com CRUD em tab secundaria.
- Provider abstraction de CNPJ em `lib/cnpj/provider.ts`, com provider desabilitado por padrao e BrasilAPI quando `CNPJ_PROVIDER=brasilapi`.
- Leitura real por Prisma quando o banco esta configurado; modo demo quando nao ha banco.
- Server actions para criar/atualizar clientes e tipos de cobranca.
- Auditoria para alteracoes sensiveis:
  - `CLIENT_CREATED`;
  - `CLIENT_UPDATED`;
  - `BILLING_TYPE_CREATED`;
  - `BILLING_TYPE_UPDATED`;
  - `CLIENT_CNPJ_LOOKUP`.
- Campos financeiros/fiscais sao removidos no servidor para papeis nao financeiros antes de chegar ao client component.
- `SALES` pode operar dados basicos de cliente, mas nao ve nem altera billing/fiscal.

## Arquivos Principais

- `apps/web/src/app/app/clientes/page.tsx`
- `apps/web/src/app/app/clientes/actions.ts`
- `apps/web/src/components/clients/ClientsView.tsx`
- `apps/web/src/components/clients/ClientStatusBadge.tsx`
- `apps/web/src/components/clients/ClientsView.test.tsx`
- `apps/web/src/lib/clients/types.ts`
- `apps/web/src/lib/clients/schemas.ts`
- `apps/web/src/lib/clients/mock-data.ts`
- `apps/web/src/lib/db/clients.ts`
- `apps/web/src/lib/cnpj/provider.ts`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/auth/route-permissions.ts`

## Validacoes

- `npm exec --workspace @jumpflow/web -- vitest run src/components/clients/ClientsView.test.tsx`: passou, 3 testes.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 64 arquivos e 738 testes.
- `npm run build`: passou.
- `claude -p` review read-only da Fase 6: encontrou bloqueadores de vazamento financeiro; foram corrigidos e revalidados como GO.

## Achados do Claude Corrigidos

- `/app/clientes` nao tinha `requireRole` na pagina; corrigido com gate server-side.
- `listClients` serializava campos financeiros/fiscais para papeis nao financeiros; corrigido com `includeFinancials`.
- `billingTypeId` e `roundingRule` ficavam editaveis para nao-financeiro, mas eram descartados no servidor; corrigido desabilitando esses campos na UI quando `!canViewFinancials`.
- Auditoria de cliente agora registra no `after` apenas o payload efetivamente persistido.

## Pendencias / Observacoes

- `Client.document` ainda nao e unico; avaliar constraint unica/parcial para CNPJ em fase futura.
- `lookupCnpj` ainda nao registra `IntegrationEvent` nem retry/rate-limit; provider abstraction esta pronta para evoluir.
- `logoUrl` aceita URL livre; validar protocolo/host em fase futura se houver imagens externas reais.
- A migration da Fase 2 ainda precisa ser aplicada em ambiente com `DATABASE_URL`/`DIRECT_URL` reais.

