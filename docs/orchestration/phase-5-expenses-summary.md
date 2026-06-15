# Phase 5 - Expenses Attachments Summary

Data: 2026-06-13
Status: concluida

## Objetivo

Evoluir Despesas para exigir comprovante no envio, permitir preview/download por URL assinada, preservar a abstraction de storage e auditar acesso sensivel ao anexo.

## Escopo Implementado

- `submitExpense` agora exige comprovante persistido antes de enviar a despesa para aprovacao.
- O formulario permite salvar rascunho sem anexo, mas bloqueia `Enviar para aprovacao` sem comprovante.
- A lista de despesas desabilita o envio direto de rascunhos sem anexo.
- O modal de comprovante passou a oferecer:
  - preview em tela via signed URL;
  - acao de download usando a mesma abstraction de URL assinada.
- `getReceiptUrl` registra auditoria `EXPENSE_ATTACHMENT_SIGNED_URL_CREATED`.
- A auditoria de acesso usa `recordAuditEvent`, evitando que falha no audit log derrube a visualizacao autorizada.
- O modo demo foi preservado: rascunhos seguem funcionando localmente e a exigencia de anexo vale apenas para envio.

## Arquivos Principais

- `apps/web/src/app/app/despesas/actions.ts`
- `apps/web/src/app/app/despesas/actions.test.ts`
- `apps/web/src/components/expenses/ExpenseForm.tsx`
- `apps/web/src/components/expenses/ExpenseList.tsx`
- `apps/web/src/components/expenses/ExpensesView.tsx`
- `apps/web/src/components/expenses/ExpensesView.test.tsx`

## Validacoes

- `npm exec --workspace @jumpflow/web -- vitest run src/app/app/despesas/actions.test.ts src/components/expenses/ExpensesView.test.tsx`: passou, 60 testes.
- `npm run lint`: passou.
- `npm run typecheck`: passou.
- `npm run test`: passou, 63 arquivos e 733 testes.
- `npm run build`: passou.
- `claude -p` review read-only da Fase 5: achado medio corrigido antes do fechamento.

## Achados do Claude Corrigidos

- A auditoria de URL assinada estava usando `prisma.auditEvent.create` direto. Foi trocada para `recordAuditEvent` para manter a visualizacao resiliente caso a escrita de auditoria falhe.

## Pendencias / Observacoes

- Go operacional depende de storage configurado no ambiente alvo (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e bucket de comprovantes). Sem storage, o fluxo permite rascunho, mas o envio fica bloqueado pela regra de comprovante obrigatorio.
- O botao `Baixar` usa a URL assinada atual. Em storage cross-origin, o navegador pode abrir o arquivo em vez de forcar download com nome local; melhorar depois expondo `Content-Disposition`/download option na abstraction.
- A auditoria registra geracao de signed URL, sem diferenciar preview e download.
- O TTL auditado continua em 300 segundos, alinhado ao valor atual da signed URL.
