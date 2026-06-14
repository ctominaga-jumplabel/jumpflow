# Fase 13 - Revisao Final e Hardening

Data: 2026-06-14
Status: concluida

## Escopo

Revisao final das Fases 10 a 12:

- Fase 10: Financeiro Receita e base fiscal/NFS-e.
- Fase 11: Pagamento de consultores.
- Fase 12: Previsao de pagamento.

## Resultado

Status final: GO.

Nao foram encontrados bloqueantes restantes em RBAC, auditoria, estados financeiros ou calculos de pagamento apos as correcoes aplicadas.

## Validacoes Finais

- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 75 arquivos e 767 testes.
- `npm run build`: passou.
- `claude -p` revisao final read-only da Fase 13: GO, sem bloqueantes.

## Correcoes Relevantes Durante o Hardening

- Fase 10:
  - Auditoria da geracao de fechamento de receita movida para a mesma transacao do recaculo.
  - Rascunho de NFS-e reaproveita documento nao cancelado existente.
- Fase 11:
  - Corrigido risco de superpagamento: `pjAmount` e valor mensal/fixo e nao taxa horaria.
  - Linhas por projeto usam somente `hourlyRate`.
  - Adicionado teste para PJ fixo mensal.
- Fase 12:
  - Validacao de datas reforcada para impedir datas invalidas e prazo de retorno posterior ao pagamento previsto.

## Pendencias Nao Bloqueantes

- `ConsultantPaymentForecast` ainda permite multiplas previsoes para a mesma competencia; considerar dedupe/upsert ou indice futuro.
- `createFiscalDocumentDraft` evita duplicidade sequencial, mas clique concorrente extremo ainda pode criar dois rascunhos sem indice unico especifico.
- `generateConsultantPayments` pula consultores sem compensacao ativa sem contador operacional; adicionar `skippedNoCompensation` no audit.
- CLT sem horas aprovadas nao e gerado automaticamente; confirmar regra operacional para folha.
- Descontos percentuais sobre bucket PJ em CLT FLEX precisam validacao de negocio antes de uso real.
- Caminho NFS-e ate `ISSUED` e `INVOICED` depende de provider real ou registro manual futuro.
- Provider bancario real, CNAB/ERP e conciliacao automatica ficaram fora do escopo.
- Email de previsao ainda nao tem idempotencia forte contra reenvio.
- `EMAIL_PROVIDER=resend` sem secrets cai para console; em producao, considerar falhar alto.
- A protecao por role ainda depende dos guards de pagina/action; reforco no proxy/middleware pode ser avaliado depois.
- Migration da Fase 2 ainda precisa ser aplicada em ambiente com banco real.

## Proximos Passos Recomendados

- Aplicar migrations em ambiente com banco real e executar smoke manual dos fluxos com dados reais.
- Adicionar testes de integracao para `generateRevenueClosings`, `generateConsultantPayments`, previsoes e transicoes financeiras.
- Implementar provider real NFS-e e registro manual/automatico de `FiscalDocument.ISSUED`.
- Implementar provider bancario/ERP ou exportacao operacional segura.
- Definir regra de folha para CLT sem horas aprovadas e regras finais de desconto CLT FLEX.
