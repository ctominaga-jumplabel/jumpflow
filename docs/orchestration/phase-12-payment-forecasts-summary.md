# Fase 12 - Previsao de Pagamento

Data: 2026-06-14
Status: concluida

## Objetivo

Adicionar cadastro operacional de previsoes de pagamento por competencia, com prazo de retorno, data prevista e relacionamento com pagamentos de consultores.

## Entregas

- `/app/pagamentos` agora aceita filtros `month` e `year` via query string.
- Painel `PaymentForecastPanel` lista previsoes da competencia.
- Criacao de previsao mensal com:
  - data/hora limite de retorno;
  - data/hora prevista de pagamento;
  - auditoria;
  - vinculo automatico aos pagamentos da mesma competencia que ainda nao possuem `forecastId`.
- `listPaymentForecasts` retorna previsoes com contagem de pagamentos vinculados.
- `createPaymentForecast` executa criacao, vinculo e auditoria na mesma transacao.
- Validacao impede datas invalidas e prazo de retorno posterior ao pagamento previsto.

## Arquivos Alterados

- `apps/web/src/app/app/pagamentos/page.tsx`
- `apps/web/src/app/app/pagamentos/actions.ts`
- `apps/web/src/components/payments/PaymentForecastPanel.tsx`
- `apps/web/src/components/modules-smoke.test.tsx`
- `apps/web/src/lib/db/payments.ts`
- `apps/web/src/lib/payments/types.ts`
- `docs/orchestration/jumpflow-execution-state.md`
- `docs/orchestration/phase-12-payment-forecasts-summary.md`

## Decisoes

- A previsao criada pela UI e de competencia inteira (`consultantId = null`).
- Pagamentos ja vinculados a outra previsao nao sao sobrescritos.
- Dedupe forte de previsoes por competencia ficou para hardening futuro; o schema atual permite multiplas previsoes.
- O email individual da Fase 11 continua disponivel por pagamento; a Fase 12 foca no cadastro/vinculo.

## Validacoes

- `npm exec --workspace @jumpflow/web -- vitest run src/components/modules-smoke.test.tsx src/app/app/rbac-guards.test.tsx src/lib/auth/route-permissions.test.ts`: passou, 3 arquivos e 30 testes.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 75 arquivos e 767 testes.
- `npm run build`: passou.
- `claude -p` review curto da Fase 12: GO.

## Limitacoes

- Ainda nao ha dedupe/upsert para impedir multiplas previsoes da competencia inteira no mesmo mes.
- Ainda nao ha selecao de consultor especifico no formulario.
- Datas sao validadas por formato e ordem, mas nao por aderencia ao mes da competencia.
