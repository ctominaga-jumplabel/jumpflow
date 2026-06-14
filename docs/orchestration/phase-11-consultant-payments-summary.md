# Fase 11 - Financeiro Pagamento Consultores

Data: 2026-06-14
Status: concluida

## Objetivo

Implementar fluxo operacional de pagamento de consultores com calculos por contrato, abertura por projeto/beneficio, email de previsao e estados auditados.

## Entregas

- Nova rota `/app/pagamentos`, protegida por `FINANCIAL_ROLES`.
- Listagem de `ConsultantPayment` por competencia com total, buckets CLT/PJ/beneficios, datas e linhas.
- Geracao idempotente de pagamentos por consultor a partir de horas aprovadas da competencia.
- Linhas por projeto com horas aprovadas e taxa de custo quando `hourlyRate` existir.
- Linhas de beneficios incluindo `ConsultantBenefit` e `benefitCardAmount`.
- Calculos testados para PJ, PJ fixo mensal, CLT e CLT FLEX.
- Maquina de estados:
  - `OPEN -> WAITING_FOR_INVOICE -> INVOICE_RECEIVED -> INVOICE_VALIDATED -> APPROVED_FOR_PAYMENT -> SENT_TO_BANK -> PROCESSED -> PAID`
  - CLT pula NF via `APPROVE_CLT_PAYMENT`.
- Email de previsao com `expectedPaymentAt` e `responseDeadlineAt`, usando o transport existente.
- `ConsultantPaymentForecast` minimo criado ao enviar previsao.
- Provider bancario abstraido e desabilitado por padrao.
- Auditoria em geracao, transicoes e envio de previsao.
- Navegacao, launcher, RBAC map e smoke tests atualizados.

## Arquivos Alterados

- `apps/web/src/app/app/pagamentos/page.tsx`
- `apps/web/src/app/app/pagamentos/actions.ts`
- `apps/web/src/components/payments/ConsultantPaymentsPanel.tsx`
- `apps/web/src/lib/db/payments.ts`
- `apps/web/src/lib/payments/amounts.ts`
- `apps/web/src/lib/payments/amounts.test.ts`
- `apps/web/src/lib/payments/state-machine.ts`
- `apps/web/src/lib/payments/state-machine.test.ts`
- `apps/web/src/lib/payments/types.ts`
- `apps/web/src/lib/payments/notify.ts`
- `apps/web/src/lib/bank/provider.ts`
- `apps/web/src/lib/bank/provider.test.ts`
- `apps/web/src/lib/auth/route-permissions.ts`
- `apps/web/src/lib/auth/route-permissions.test.ts`
- `apps/web/src/lib/navigation.ts`
- `apps/web/src/lib/launcher.ts`
- `apps/web/src/app/app/rbac-guards.test.tsx`
- `apps/web/src/components/modules-smoke.test.tsx`
- `docs/orchestration/jumpflow-execution-state.md`
- `docs/orchestration/phase-11-consultant-payments-summary.md`

## Decisoes

- `pjAmount` e tratado como valor mensal/fixo, nunca como taxa horaria.
- Linhas por projeto usam somente `hourlyRate`; se nao houver taxa, a linha fica com valor zero e o bucket PJ carrega o valor fixo.
- CLT e CLT FLEX sem horas aprovadas ainda nao sao gerados automaticamente; o gerador parte de `TimeEntry.APPROVED`.
- Envio ao banco e status `SENT_TO_BANK` sao manuais nesta fase; provider real ficou deferido.
- Cadastro completo de previsoes ficou para Fase 12.

## Validacoes

- `npm exec --workspace @jumpflow/web -- vitest run src/lib/payments/amounts.test.ts src/lib/payments/state-machine.test.ts src/lib/bank/provider.test.ts`: passou, 3 arquivos e 7 testes.
- `npm exec --workspace @jumpflow/web -- vitest run src/components/modules-smoke.test.tsx src/app/app/rbac-guards.test.tsx src/lib/auth/route-permissions.test.ts`: passou, 3 arquivos e 29 testes.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 75 arquivos e 766 testes.
- `npm run build`: passou.
- `claude -p` review read-only da Fase 11: NO-GO inicial por risco de superpagamento PJ fixo.
- `claude -p` recheck apos correcao: GO.

## Limitacoes

- CRUD completo de `ConsultantPaymentForecast` ficou para a Fase 12.
- Provider bancario real, CNAB/ERP e conciliacao automatica ficaram deferidos.
- Email de previsao ainda nao tem idempotencia forte contra reenvio.
- Cancelamento so existe a partir de `OPEN`.
- CLT sem horas aprovadas nao e gerado automaticamente.
