# ADR 0002 — Contrato comercial vinculado ao projeto

- **Status:** Fase 1 implementada (entidade da Fase 2 pendente)
- **Data:** 2026-06-23 (Fase 1 em 2026-06-25)
- **Contexto de produto:** `docs/plano-melhorias-financeiro-operacional.md` (Onda 5, itens 5.1/5.3/5.4 e tema 6)

## Contexto

As anotações de melhoria pedem: *"vincular contrato comercial ao projeto — notificar
comercial quando estiver ausente"*, *"projeto sem consultor vinculado, com previsão de
pagamento, liberação automática para faturamento e status de faturado"* e *"vincular
faturamento ao % de andamento do projeto"*.

Hoje o `Project` acumula o papel de contrato: os termos comerciais vivem em
`ProjectBillingConfig` (tipo de cobrança, regras) e em `ProjectSaleRate` (valores), mas
**não existe uma entidade de contrato comercial** — número, vigência, valor total
contratado, anexo do contrato assinado, escopo (com/sem consultor). O motor de
notificações (Onda 1/2) já tem o evento `COMMERCIAL_CONTRACT_MISSING` e o template
`buildContratoAusenteEmail` prontos, mas **sem um sinal de "contrato presente/ausente"**
não há o que disparar.

## Decisão a tomar

Existe um espectro entre dois extremos:

### Opção A — Campo de referência no projeto (leve)
Adicionar `Project.commercialContractRef String?` (número/identificador do contrato) +
opcionalmente um anexo. "Contrato ausente" = campo vazio.

- **Prós:** baratíssimo (1 coluna + 1 campo de form), destrava o alerta 6.2 imediatamente,
  zero risco de regressão financeira.
- **Contras:** não modela vigência, valor contratado, escopo nem versionamento; não suporta
  5.3 (projeto sem consultor com previsão própria) nem 5.1 (faturamento por andamento) de
  forma estruturada.

### Opção B — Entidade `CommercialContract` (completa)
Tabela própria: `clientId`, `projectId?`, número, status (DRAFT/ACTIVE/CLOSED), vigência,
valor total, moeda, escopo (`WITH_CONSULTANT`/`SCOPE_ONLY`), anexo, vínculo com
`ProjectBillingConfig`. Projeto passa a referenciar o contrato.

- **Prós:** base correta para 5.1 (andamento × valor contratado → faturamento), 5.3 (contrato
  de escopo sem consultor, com previsão de pagamento e liberação automática) e relatórios de
  carteira comercial.
- **Contras:** decisão de modelagem grande; migração de projetos existentes; toca Comercial,
  Financeiro e o motor de cobrança; precisa de regras de transição de status auditadas.

## Recomendação

**Faseado: A agora, B a seguir.**

1. **Fase 1 (leve):** `Project.commercialContractRef` + anexo opcional (reusa `StorageProvider`).
   Liga o `notifyProjectCreated` ao valor real e habilita um sweep `COMMERCIAL_CONTRACT_MISSING`
   (cron) para projetos ACTIVE sem referência. Entrega 6.2 com risco mínimo.
2. **Fase 2 (entidade):** `CommercialContract` quando 5.1/5.3 forem priorizados, migrando o
   `commercialContractRef` para a entidade. Aí sim:
   - **5.1** liga `% andamento` (consumedHours/budgetHours, já calculável) ao valor contratado
     para sugerir/gatilhar faturamento por marco.
   - **5.3** modela contrato de escopo (sem consultor) com previsão de pagamento própria,
     liberação automática para faturamento e status faturado — com auditoria por ser mudança
     financeira sensível.

## Status de implementação

**Fase 1 — feita (2026-06-25):** `Project.commercialContractRef` (migration
`20260625120000_project_commercial_contract_ref`, aplicada em prod); editável no Comercial
(`/app/comercial`); `notifyProjectCreated` deriva `hasCommercialContract` do campo; sweep
`COMMERCIAL_CONTRACT_MISSING` via job `/api/jobs/missing-contract` (cron semanal) usando o
template `buildContratosAusentesEmail`. Anexo do contrato e a entidade da Fase 2 seguem pendentes.

## Consequências

- O motor de notificações não muda — só ganha o sinal de "contrato ausente".
- A Fase 1 é reversível e não acopla o faturamento. A Fase 2 exige um novo ADR de transição de
  status do contrato antes de automatizar liberação/faturamento (evitar corromper receita).
- Enquanto a Fase 2 não acontece, 5.1 e 5.3 ficam como **pendências de produto**, não dívida de
  código.
