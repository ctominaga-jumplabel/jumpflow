# CURRENT_STATE

> Atualizado: 2026-06-15. Snapshot apos Fase H (roadmap A-H COMPLETO).

## Fase atual

Base do MVP **publicada em producao**. **Fases A-H TODAS CONCLUIDAS** (verde:
898 testes, 86 arquivos, lint 0 warnings, typecheck). Roadmap de melhorias por
tela 100% executado. Proximo: aplicar migrations pendentes + setup de infra/cert
(ver abaixo) e validacao manual em homologacao.

## MIGRATIONS PENDENTES DE APLICAR (rodar `npm run db:deploy` com .env do DB)

- `20260615120000_expand_billing_charge_type` (Fase C) - enum BillingChargeType
  para 16 valores. Aditiva (ALTER TYPE ADD VALUE), segura. Fora de transacao.
- `20260615130000_add_allocation_skill` (Fase D) - tabela AllocationSkill. Nasce
  vazia, nao afeta dados existentes.
- `20260615140000_add_client_contact_email` (Fase G) - coluna Client.contactEmail
  nullable. Aditiva.
- `20260615150000_add_pre_invoice_email_type` (Fase G) - enum AutomationEmailType
  +PRE_INVOICE. Aditiva (ALTER TYPE ADD VALUE).
- `20260615160000_add_nfse_issued_email_type` (Fase H) - enum AutomationEmailType
  +NFSE_ISSUED. Aditiva (ALTER TYPE ADD VALUE).

## PRE-REQUISITO INFRA (devops)

- Bucket Supabase privado `client-logos` (Fase C, analogo a `expense-receipts`).
  Sem ele/sem envs SUPABASE_*, upload de logo degrada para input de URL.

## O que funciona (Pronto)

- **Auth/RBAC:** Entra ID + NextAuth v5, convites, RBAC server-side, proxy.ts.
- **Horas:** filtros (status/projeto/atividade), periodo, calendario adaptativo,
  cor por status + legenda, totais por periodo/projeto, lancamento dia e semana
  (semana replica descricao).
- **Aprovacoes:** decisao em massa (so itens Pendentes), aprovacao automatica
  idempotente e auditada (`docs/aprovacao-automatica.md`).
- **Despesas:** anexo obrigatorio no envio + download.
- **Clientes:** todos os campos fiscais/cobranca; CRUD de tipos de cobranca;
  lookup CNPJ (BrasilAPI, via env).
- **Projetos:** alocacao de consultores; valor de venda por periodo (SALES),
  multiplos valores, validacao de overlap.
- **Skills:** sugestao por descricao (PENDING) com evidencia; confirmar/rejeitar/
  editar/apagar.
- **Consultores:** dados pessoais+CPF, empresa+CNPJ, endereco+CEP, contratacao
  CLT/PJ/CLT FLEX, contas bancarias (FLEX exige CLT+PJ), compensacao + descontos.
- **Financeiro Receita:** fluxo de status completo + fechamento + auditoria.
- **Financeiro Pagamento:** fluxo de status, calculo PJ/CLT/CLT FLEX, previsao
  de pagamento (subtela), datas de previsao/confirmacao.

## Concluido na Fase A (2026-06-15)

- Horas: tooltip de hover na grade (`TimeEntryRow.tsx` - projeto/atividade/total/
  status) e edicao de lancamento **Enviado** (`isRowEditable` aceita SUBMITTED;
  `updateTimeEntry` libera SUBMITTED, bloqueia APPROVED/CLOSED; AuditEvent grava
  `before.status` para rastrear reabertura).
- Despesas: preview por contentType (imagem `<img>`, PDF `<iframe>`, demais =
  aviso+download), toggle de preview e correcao do estado preso ao 1o anexo.

## Concluido na Fase B (2026-06-15)

- Aprovacoes: decisao em massa nas abas Pendentes e Historico; reabrir
  APPROVED/REJECTED -> SUBMITTED; CLOSED terminal; Approval manual + AuditEvent.
- Auto-aprovacao: motor pula entries com Approval manual previo (idempotente).

## Concluido na Fase C (2026-06-15)

- Clientes: catalogo de cobranca com 16 valores (cobre os 14 modelos); Zod+types+
  labels sincronizados; migration aditiva pendente de apply.
- Upload de logo via storage (bucket `client-logos`, storage key em `logoUrl` +
  URL assinada na exibicao); degrada para input de URL sem storage.
- Bug de foco do CNPJ: era do `Modal` (efeito de foco dependia de `onClose`
  inline que muda a cada tecla); corrigido com `onCloseRef` + deps `[open]`.
  Corrige TODOS os modais com inputs controlados pelo pai.

## Concluido na Fase D (2026-06-15)

- Projetos: modelo `AllocationSkill` + CRUD na aba "Skills" do projeto (skill por
  alocacao do catalogo ACTIVE, isolada de `ConsultantSkill`); RBAC + auditoria.
- Bug colateral corrigido: `toFailure` reengole redirect do `requireRole` (NEXT_*).
- Confirmado: valor de venda -> NF por hora ja estava implementado.

## Concluido na Fase E (2026-06-15)

- Consultores: VA(FOOD)/VR(MEAL)/VT(TRANSPORTATION) no "Valor acordado" via
  `ConsultantBenefit` (upsert do row ativo); reflete no `benefitAmount`.
- Calculadora de encargos CLT (`lib/consultants/clt-charges.ts`,
  `CLT_CHARGE_TABLES_2026`): INSS/IRRF descontam, FGTS informativo; injetada em
  `computeCompensation` via `cltCharges` (derivado, nao persiste numeros).
  No CLT FLEX incide so na parcela CLT. NOTA: tabelas mudam por ano (revisar).

## Concluido na Fase F (2026-06-15)

- Pagamento: filtros server-side por consultor/status/contratacao (combinaveis
  com mes/ano); `listPaymentConsultants()` para popular o select.
- E-mail de previsao com abertura por projeto (horas+valor) para PJ/CLT FLEX
  (de `ConsultantPaymentLine`); CLT puro omite a tabela.

## Concluido na Fase G (2026-06-15)

- Receita: builder PURO de pre-fatura (`lib/billing/pre-invoice.ts`); action gated
  em CLOSED; storage `pre-invoices` ou exibe. E-mail idempotente ao contactEmail.

## Concluido na Fase H (2026-06-15)

- NFS-e real SP modular em `lib/nfse/` (config/xml-builder/response-parser/signing/
  sao-paulo-provider/references). `getNfseProvider()` ativa o provider real so com
  `isNfseConfigured()`; senao disabled (preserva comportamento). Wiring em
  `financeiro/actions.ts`: REQUESTED->ISSUED/FAILED, armazena XML/PDF (bucket
  `nfse`), grava invoiceNumber/protocol, IntegrationEvent idempotente, e-mail
  NFSE_ISSUED ao cliente. Builders/parsers puros e testados offline.

## PENDENTE DE SETUP EXTERNO (Fase H, nao codificavel aqui)

- Certificado digital A1 + credenciais homologacao SP. Envs: NFSE_SP_ENDPOINT,
  NFSE_PRESTADOR_CNPJ, NFSE_PRESTADOR_IM, NFSE_CERT_PFX_BASE64, NFSE_CERT_PASSWORD,
  NFSE_AMBIENTE(homologacao|producao). Registrar um `NfseSigner` real (XMLDSig com
  A1) via `setNfseSigner(...)` - hoje o signer default recusa honestamente.
- Bucket Supabase `nfse` (privado) + `pre-invoices` + `client-logos`.

## Roadmap concluido

Todas as lacunas do `docs/backlog-melhorias-telas-2026-06.md` foram endderecadas.
Restam apenas itens de SETUP/INFRA (migrations, buckets, certificado), nao de codigo.

## Integracoes

Entra ID = real. CNPJ/CEP/Email/Storage = reais por env (off por padrao).
NFS-e SP / Banco / ERP = **stubs**.

## Detalhe completo

`docs/backlog-melhorias-telas-2026-06.md` (diagnostico tela a tela + evidencias).
