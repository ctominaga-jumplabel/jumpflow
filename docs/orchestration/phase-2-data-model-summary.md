# Fase 2 - Resumo de Modelo de Dados

Data: 2026-06-13
Status: concluida

## Objetivo

Expandir a fundacao de dados do JumpFlow para sustentar billing, fiscal/NFS-e,
pagamento de consultores, compensacao, beneficios, integracoes e cadastros
financeiros/fiscais, sem implementar telas ou providers reais.

## Entregas

- Schema Prisma expandido em `packages/database/prisma/schema.prisma`.
- Migration manual adicionada em
  `packages/database/prisma/migrations/20260613100000_phase2_data_model_foundation/migration.sql`.
- `docs/modelo-dados.md` atualizado com a expansao Fase 2.
- `docs/arquitetura.md` atualizado com ADR16.

## Principais Entidades

- `BillingType`
- `ProjectSaleRate`
- `ConsultantAllocationCostRate`
- `ConsultantPersonalInfo`
- `ConsultantCompanyInfo`
- `ConsultantAddress`
- `ConsultantBankAccount`
- `ConsultantCompensation`
- `ConsultantBenefit`
- `RevenueClosing`
- `RevenueClosingLine`
- `FiscalDocument`
- `ConsultantPaymentForecast`
- `ConsultantPayment`
- `ConsultantPaymentLine`
- `IntegrationEvent`

## Decisoes

- Expansao aditiva: entidades MVP continuam existindo.
- Dados sensiveis de consultor usam `onDelete: Restrict`.
- Custo por alocacao/vigencia foi separado do valor de venda.
- Fechamento de receita client-level usa indice parcial SQL para unicidade com
  `projectId IS NULL`.
- Numero fiscal e unico por provider quando informado.
- Integracoes usam log proprio sem armazenar secrets.

## Validacoes

- `prisma format`: passou.
- `prisma validate` com URLs dummy: passou.
- `npm run db:generate`: passou.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 63 arquivos e 721 testes.
- `npm run build`: passou.
- Revisao `claude -p`: passou apos correcoes.

## Limitacoes

- `prisma migrate dev --create-only` nao rodou porque `DIRECT_URL` nao estava
  disponivel para o Prisma CLI no workspace.
- A migration foi criada manualmente e ainda precisa ser aplicada contra banco
  configurado.

## Proxima Fase

Fase 3 - Horas.
