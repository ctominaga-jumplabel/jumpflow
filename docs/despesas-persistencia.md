# Despesas - Persistencia Real e Comprovantes (Rodada 3)

Spec tecnica para EP-DES (`docs/backlog-refinado-consultor-operacoes.md`,
secao "Despesas - Decisoes Confirmadas (Rodada 3)"). Substitui o estado
local/mock do modulo Despesas por Prisma + Server Actions + Supabase Storage.
Mesmo formato/padroes de `docs/horas-persistencia.md` (Rodada 2).

## 1. Convencoes de dominio

- `Expense.date`: sempre normalizada para meia-noite UTC (date-only), via `parseIsoDateUtc` de `lib/timesheet/week.ts` (helper reutilizado; sem semana/periodo em despesas).
- Consultor atual: `getConsultantForUser(user)` (mesmo helper de Horas, com fallback de email SOMENTE em dev auth). Sem `Consultant`: pagina mostra EmptyState; actions retornam `NO_CONSULTANT`.
- Alocacao estrita (paridade com Horas): criar/editar exige `Allocation ACTIVE` do consultor no projeto cobrindo `date` (`findActiveAllocation`); projeto `CLOSED` nunca recebe despesa (`PROJECT_CLOSED`). Gravar `allocationId` na despesa.
- FKs de decisao (`Approval.approverUserId`, `AuditEvent.actorUserId`, `ExpenseAttachment.uploadedByUserId`): SEMPRE `resolveDbUser(user).id` — nunca o id da sessao ("dev-user" nao existe no banco).
- Modelo canonico (criado pelo data-modeler; usar estes nomes): enum `ExpenseStatus` (`DRAFT, SUBMITTED, MANAGER_APPROVED, MANAGER_REJECTED, FINANCE_APPROVED, FINANCE_REJECTED, PAYMENT_SCHEDULED, PAID`); `ApprovableEntityType` ganha `EXPENSE`; `Expense` (id, consultantId, projectId, allocationId?, date, amount Decimal(12,2), description, invoiceNumber?, status, submittedAt?, attachment? 1:1, createdAt, updatedAt); `ExpenseAttachment` (id, expenseId @unique, fileName, contentType, size Int, storageBucket, storageKey, uploadedByUserId? FK User SetNull, createdAt).

## 2. Camada storageProvider (`apps/web/src/lib/storage/`)

- `provider.ts`: interface neutra `StorageProvider = { upload(key, body, contentType), delete(key), getSignedUrl(key, expiresInSeconds) }` + `isStorageConfigured(): boolean` + `getStorageProvider(): StorageProvider | null`. Nenhum tipo do Supabase vaza para o dominio; trocar de provider = nova implementacao do contrato.
- `supabase-storage.ts`: implementacao via REST do Supabase Storage com `fetch` nativo, SEM SDK npm (mesma motivacao do ADR13: contrato ja isola o chamador, fetch evita peso/CVE no bundle serverless e mantem portabilidade para Render). Endpoints: `POST {SUPABASE_URL}/storage/v1/object/{bucket}/{key}` (upload, header `Authorization: Bearer {SERVICE_ROLE_KEY}` + `content-type`), `DELETE .../object/{bucket}/{key}`, `POST .../object/sign/{bucket}/{key}` body `{ expiresIn }` (retorna path assinado; URL final = `{SUPABASE_URL}/storage/v1{signedPath}`). Erros HTTP viram falha tipada do provider (nunca vazam o token em log).
- Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; bucket fixo `expense-receipts` (privado, criado via devops). `isStorageConfigured()` = ambas as envs presentes.
- Degradacao honesta: essas envs NAO existem ainda em nenhum ambiente. Com `isStorageConfigured() === false`: o modulo de despesas funciona normalmente SEM comprovante; o campo de anexo exibe aviso "Anexos indisponiveis: storage nao configurado" (tone warning, sem input de arquivo); `attachReceipt`/`replaceReceipt` retornam `NO_STORAGE`; `getSignedUrl` de anexos legados retorna `NO_STORAGE`. Nunca fingir upload.
- Signed URL: duracao curta (300s), gerada no servidor APOS o RBAC da secao 7. Nunca persistir URL assinada; persistir apenas `storageBucket` + `storageKey`.

## 3. Validacao de arquivo no servidor

Helpers puros em `apps/web/src/lib/storage/file-validation.ts` (testaveis sem rede):

- MIME whitelist: `application/pdf`, `image/jpeg`, `image/png`, `image/webp` -> senao `INVALID_FILE`.
- Extensao whitelist: `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`, e extensao deve ser coerente com o MIME -> senao `INVALID_FILE`.
- Tamanho: `size > 0` e `<= 10 * 1024 * 1024` -> senao `FILE_TOO_LARGE`.
- `safeFileName(name)`: minusculas, ASCII puro (remove acentos/nao-ASCII), espacos -> `-`, somente `[a-z0-9._-]`, sem `..`/`/`/`\` (anti path traversal), max 100 chars, fallback `comprovante` se vazio.
- `buildStorageKey(expenseId, fileName, now)`: `expenses/{expenseId}/{timestamp}-{safeFileName}` com timestamp `yyyy-mm-ddThhmmssZ`. O path NUNCA contem CPF, consultor, cliente, projeto ou dado sensivel (so o cuid da despesa).
- Transporte: `FormData` em Server Action (`attachReceipt(formData)`); o arquivo vem como `File`, validado no servidor ANTES de qualquer chamada ao storage. A validacao client do `ExpenseAttachmentField` e pre-checagem (atualizar para 10 MB + webp); o servidor e a autoridade.

## 4. Contrato das Server Actions

Arquivo novo `apps/web/src/app/app/despesas/actions.ts` (`"use server"`). Mesmo padrao de Horas: `ActionResult<T>`, `ActionError` interna, `toFailure`, `ensureDatabase`, `revalidatePath` (`/app/despesas`, e `/app/aprovacoes` + `/app/financeiro` quando a acao afeta filas). Schemas Zod em `apps/web/src/lib/expenses/schemas.ts`: `expenseInputSchema` (projectId cuid, date `yyyy-mm-dd`, amount number > 0 com ate 2 casas e <= 999999.99, description trim 1..500, invoiceNumber trim max 60 opcional), `decideExpenseSchema` (expenseId, decision `"APPROVED" | "REJECTED"`, comment obrigatorio nao-vazio quando REJECTED -> `COMMENT_REQUIRED`), `setPaymentSchema` (expenseId, action `"SCHEDULE" | "MARK_PAID" | "CANCEL_SCHEDULE"`, reason obrigatorio quando CANCEL_SCHEDULE).

ErrorCode: reutiliza o conjunto de Horas (`NO_DATABASE | NO_CONSULTANT | INVALID_INPUT | NOT_FOUND | FORBIDDEN | NO_ACTIVE_ALLOCATION | PROJECT_CLOSED | NOT_EDITABLE | ALREADY_DECIDED | COMMENT_REQUIRED | UNEXPECTED`) estendido com `NO_STORAGE | INVALID_FILE | FILE_TOO_LARGE | ATTACHMENT_LOCKED | SELF_APPROVAL`. Mover `ErrorCode`/`ActionResult` para modulo compartilhado (`apps/web/src/lib/actions/result.ts`) reexportado por Horas sem quebrar imports.

- `createExpense(input)`: guarda `requireUser` + consultor. Zod -> projeto existe e nao `CLOSED` -> alocacao ativa cobre a data. Cria com `status = DRAFT`, `submittedAt = null`. Sem anexo aqui (anexo e acao separada, pois precisa do `expenseId` no path).
- `updateExpense(input)`: `{ id, projectId?, date?, amount, description, invoiceNumber? }`. Owner check (`expense.consultantId === consultant.id` -> `FORBIDDEN`). Editavel somente em `DRAFT | MANAGER_REJECTED | FINANCE_REJECTED` (`NOT_EDITABLE` nos demais). Editar despesa reprovada retorna a `DRAFT` (`submittedAt = null`); o reenvio refaz a cadeia completa desde o gestor. Mudanca de projeto/data re-checa projeto nao-CLOSED + alocacao ativa.
- `deleteExpense({ id })`: owner check; somente `DRAFT | MANAGER_REJECTED | FINANCE_REJECTED`. Transacao: deleta `ExpenseAttachment` (se houver) + `Expense`; depois best-effort `storage.delete(key)` fora da transacao (falha de storage so loga — orfao no bucket e aceitavel, orfao no banco nao).
- `attachReceipt(formData)` / `replaceReceipt(formData)`: owner check; permitido somente em `DRAFT | MANAGER_REJECTED | FINANCE_REJECTED` (a partir de `SUBMITTED` -> `ATTACHMENT_LOCKED`). `isStorageConfigured()` false -> `NO_STORAGE`. Valida arquivo (secao 3) -> upload no provider -> upsert do `ExpenseAttachment` (1:1 por `expenseId @unique`) com `uploadedByUserId = dbUser.id`. Replace: grava o novo registro/key e deleta a key antiga no storage apos persistir (best-effort). MVP: 1 comprovante por despesa.
- `submitExpense({ id })`: owner check. Transacao com guarda: `updateMany({ where: { id, status: "DRAFT" } })` -> `SUBMITTED`, `submittedAt = now`; `count != 1` -> `NOT_EDITABLE` (ou ja enviada). AuditEvent `EXPENSE_SUBMITTED`. Comprovante NAO e obrigatorio para enviar (regra atual do gestor: pode reprovar pedindo NF).
- `decideAsManager({ expenseId, decision, comment })`: `SUBMITTED -> MANAGER_APPROVED | MANAGER_REJECTED`. RBAC secao 5. Transacao padrao decideHours (secao 6).
- `decideAsFinance({ expenseId, decision, comment })`: `MANAGER_APPROVED -> FINANCE_APPROVED | FINANCE_REJECTED`. RBAC secao 5. Mesma transacao padrao.
- `setPayment({ expenseId, action, reason? })`: RBAC secao 5. Transicoes com guarda de status: `SCHEDULE` = `FINANCE_APPROVED -> PAYMENT_SCHEDULED`; `MARK_PAID` = `PAYMENT_SCHEDULED -> PAID`; `CANCEL_SCHEDULE` = `PAYMENT_SCHEDULED -> FINANCE_APPROVED` com `reason` obrigatorio (`COMMENT_REQUIRED` se vazio). `count != 1` -> `ALREADY_DECIDED`. `PAID` e o unico terminal. Sem Approval (nao e decisao de aprovacao); somente AuditEvent (secao 6).

## 5. RBAC por acao

- create/update/delete/attach/submit: usuario autenticado COM `Consultant` vinculado; ownership pela FK `consultantId`.
- `decideAsManager`: `requireRole(["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"])`; PROJECT_MANAGER somente quando `expense.project.managerUserId === dbUser.id` (`FORBIDDEN` fora de escopo); ADMIN/AREA_MANAGER sem restricao. FINANCE puro NAO aprova como gestor (so se tambem tiver role de gestor/admin).
- `decideAsFinance` e `setPayment`: `requireRole(FINANCIAL_ROLES)` (FINANCE, AREA_MANAGER, ADMIN).
- Segregacao de funcoes: em TODA decisao e mudanca de pagamento, se `expense.consultant.userId === dbUser.id` (ou, em dev auth, email do consultor === email do usuario) -> `SELF_APPROVAL` ("Voce nao pode decidir/pagar a propria despesa."). Vale para todas as etapas e todos os papeis, inclusive ADMIN.
- Route map (`route-permissions.ts`): adicionar `FINANCE` ao acesso de `/app/aprovacoes` (`["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER", "FINANCE"]`) e atualizar o `requireRole` da pagina. FINANCE ve apenas a etapa financeira da fila (secao 7). `/app/despesas` segue `ALL`; `/app/financeiro` segue `FINANCIAL_ROLES`.

## 6. Approval + AuditEvent (mesma transacao, guarda de status)

Padrao `decideHours`/motor: cada decisao em UMA transacao:

1. `updateMany({ where: { id, status: <statusEsperado> } })` -> novo status; `count != 1` -> `ALREADY_DECIDED` (race-safe, idempotente);
2. `approval.create({ entityType: "EXPENSE", entityId, approverUserId: dbUser.id, status: decision, comment, isAutomatic: false })` — o par MANAGER/FINANCE fica registrado pela acao de auditoria e pela ordem; o historico de Approvals e preservado em reenvios;
3. `auditEvent.create` via `buildAuditEventData` (entityType `"Expense"`, actor = dbUser.id, `after = { comment }` ou `{ reason }`).

Acoes de auditoria nomeadas: `EXPENSE_SUBMITTED`, `EXPENSE_MANAGER_APPROVED`, `EXPENSE_MANAGER_REJECTED`, `EXPENSE_FINANCE_APPROVED`, `EXPENSE_FINANCE_REJECTED`, `EXPENSE_PAYMENT_SCHEDULED`, `EXPENSE_PAID`, `EXPENSE_PAYMENT_CANCELLED`, `EXPENSE_ATTACHMENT_ADDED`, `EXPENSE_ATTACHMENT_REPLACED`. `setPayment` gera somente AuditEvent (sem Approval).

## 7. Queries de leitura (`apps/web/src/lib/db/expenses.ts`)

Assumem banco configurado (caller guarda com `isDatabaseConfigured()`). `select` estreito; nunca expor campos financeiros de projeto.

- `listExpensesForConsultant(consultantId, filter)`: despesas do consultor com filtros status/projeto/periodo (datas inclusive), mapeadas para o shape `Expense` da UI (status novo da cadeia unica; `rejectionReason` = comment do ultimo Approval REJECTED; attachment = metadados). Inclui helper de totais por status (port de `summarizeExpenses` para a cadeia nova: aPagar = FINANCE_APPROVED, agendada = PAYMENT_SCHEDULED, paga = PAID).
- `listExpenseApprovalItems(scope)`: fila unica com etiqueta da etapa. Pendentes: `SUBMITTED` (etapa "Gestor") para quem aprova como gestor e `MANAGER_APPROVED` (etapa "Financeiro") para quem aprova como financeiro — o caller monta o escopo por role: PROJECT_MANAGER ve `SUBMITTED` dos projetos que gerencia; FINANCE ve apenas `MANAGER_APPROVED`; AREA_MANAGER/ADMIN veem ambas. Historico: `Approval` de `entityType EXPENSE` (escopo de PM resolvido ANTES do limite, como em Horas). Mapeia para `ApprovalItem` com `type: "EXPENSE"`, `source: "db"`, `expenseId`, `stage: "MANAGER" | "FINANCE"` e `amount`.
- `listFinanceExpenses()`: despesas `FINANCE_APPROVED | PAYMENT_SCHEDULED | PAID` com totais (a pagar/agendado/pago) para o `ExpensesFinancePanel`.
- `getReceiptSignedUrl(expenseId, user)`: RBAC no servidor ANTES de assinar — permitido para dono da despesa, gestor do projeto da despesa (`managerUserId`), FINANCE, AREA_MANAGER e ADMIN; mais ninguem (`FORBIDDEN`). Sem anexo -> `NOT_FOUND`; storage nao configurado -> `NO_STORAGE`. Exposta como Server Action fina (`getReceiptUrl({ expenseId })`) para o client pedir sob demanda.

## 8. Troca dos mocks (arquivos)

- Novos: `apps/web/src/app/app/despesas/actions.ts`, `apps/web/src/lib/db/expenses.ts`, `apps/web/src/lib/expenses/schemas.ts`, `apps/web/src/lib/expenses/types.ts` (tipos/labels da cadeia nova; UI deixa de importar tipos de `mock-data` no modo real), `apps/web/src/lib/storage/{provider.ts,supabase-storage.ts,file-validation.ts}`.
- `apps/web/src/app/app/despesas/page.tsx`: vira async com branch demo/sem-consultor/real; no modo real busca `listExpensesForConsultant` + projetos permitidos (alocacao ativa, paridade com Horas) e passa `mode`, dados e `storageAvailable` para a view.
- `ExpensesView`/`ExpenseList`/`ExpenseForm`: recebem `mode: "demo" | "db"`; no modo db chamam as actions (`useTransition` + mensagem do `ActionResult`); estado local SOMENTE no demo. Form ganha editar/excluir/enviar por item conforme status; badges da cadeia nova substituem `ExpensePaymentBadge` separado.
- `ExpenseAttachmentField`: 10 MB + webp; no modo db envia `FormData` para `attachReceipt`/`replaceReceipt`; com `storageAvailable === false` mostra o aviso de indisponibilidade (sem input). Modal de comprovante ganha botao "Visualizar" via `getReceiptUrl`.
- `apps/web/src/app/app/aprovacoes/page.tsx` + `ApprovalQueue`: itens EXPENSE passam a vir de `listExpenseApprovalItems` (merge real com HOURS); decidir EXPENSE chama `decideAsManager`/`decideAsFinance` conforme `stage`; etiqueta da etapa visivel; `requireRole` inclui FINANCE; contadores somam apenas itens reais.
- `apps/web/src/app/app/financeiro/page.tsx` + `ExpensesFinancePanel`: painel recebe dados reais de `listFinanceExpenses` e as acoes de `setPayment` (agendar, pagar, cancelar com motivo), visiveis apenas para `FINANCIAL_ROLES`.
- Modo demo sem banco: paginas mantem o mock atual com banner persistente "Modo demonstracao: banco nao configurado. Nada sera persistido."; actions retornam `NO_DATABASE`. `apps/web/src/lib/mock-data/expenses.ts` permanece SOMENTE para o demo, com itens marcados `source: "mock"`/badge "Demo" quando exibidos junto a dados reais (padrao Rodada 2).

## 9. Pendencias registradas na revisao (Rodada 3)

Corrigidos na propria rodada: guarda de status race-safe tambem em
updateExpense/deleteExpense/saveReceipt (updateMany/deleteMany com janela
editavel); upload orfao limpo em best-effort quando a guarda falha;
submitExpense exige usuario real do banco no audit (requireDbUser);
comprovante persistido oferece "Substituir" em vez de um remover desonesto.

Pendentes (rodada futura ou decisao):

- Acao de remocao de comprovante auditada (hoje o MVP so substitui).
- Sniff de magic bytes na validacao de arquivo (hoje MIME+extensao; mitigado
  por bucket privado + signed URL 300s).
- Normalizar NOT_FOUND/FORBIDDEN em getReceiptSignedUrl para nao revelar
  existencia da despesa (cuids tornam o risco residual).
- Badges do launcher ainda derivam de mocks em modo db (pre-existente).
- Usuario PM+FINANCE tem historico restrito aos projetos que gerencia
  (fail-closed; inconsistencia de visibilidade, nao vazamento).
- Escopo de PM no historico carrega ids sem limite (volume futuro).
- Seed: todas as despesas pertencem ao consultor do dev user, entao decidir/
  pagar em dev responde SELF_APPROVAL (segregacao correta); para smoke fim a
  fim de decisao, seedar um segundo consultor.
- Envs de storage (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) e bucket privado
  expense-receipts ainda nao provisionados em nenhum ambiente.

## 10. Testes minimos

- `file-validation.ts`: MIME/extensao fora da whitelist (`INVALID_FILE`), incoerencia MIME x extensao, 0 bytes e > 10 MB (`FILE_TOO_LARGE`), `safeFileName` (acentos, espacos, `../`, path separators, nome vazio), `buildStorageKey` sem dado sensivel.
- Schemas: amount 0/negativo/3 casas, descricao vazia, comentario vazio em REJECTED e em CANCEL_SCHEDULE (`COMMENT_REQUIRED`).
- Transicoes proibidas (Prisma mockado, padrao `auto-approval-run.test.ts`): editar/excluir/anexar em `SUBMITTED`+ (`NOT_EDITABLE`/`ATTACHMENT_LOCKED`); `decideAsManager` em despesa nao-SUBMITTED e `decideAsFinance` em nao-MANAGER_APPROVED (`ALREADY_DECIDED`); `MARK_PAID` sem agendamento; `PAID` terminal.
- RBAC matrix: consultor nao decide; PROJECT_MANAGER fora de escopo (`FORBIDDEN`); FINANCE puro nao decide etapa gestor; FINANCE decide etapa financeira e `setPayment`; CONSULTANT puro bloqueado em `setPayment`.
- Segregacao: gestor/financeiro/admin decidindo ou pagando a propria despesa -> `SELF_APPROVAL` em todas as etapas.
- Idempotencia: segunda decisao na mesma despesa -> `ALREADY_DECIDED`; `submitExpense` duplo nao reenvia; Approval + AuditEvent criados na MESMA transacao da decisao; `attachReceipt` com storage nao configurado -> `NO_STORAGE` sem tocar o banco.
- `getReceiptSignedUrl`: dono/gestor do projeto/FINANCE ok; outro consultor e PM de outro projeto -> `FORBIDDEN`.
