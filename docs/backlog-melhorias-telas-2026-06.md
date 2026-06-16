# Backlog de Melhorias por Tela - Rodada 2026-06

## Objetivo

Transformar a lista de melhorias levantadas pelo time em itens acionaveis,
validar o que ja esta implementado no JumpFlow e organizar a entrega em fases.

Este documento foi gerado a partir de uma auditoria do codigo atual
(`apps/web/src/app/app/*`, `apps/web/src/components/*`, `apps/web/src/lib/*` e
`packages/database/prisma/schema.prisma`). Cada item recebe um status:

- **Pronto** - implementado e funcional.
- **Parcial** - existe base (schema/UI/acao), mas falta comportamento pedido.
- **Ausente** - precisa ser construido.

> Convencao de tokens: ao executar uma fase, carregue apenas este doc, o
> `CLAUDE.md` e o(s) arquivo(s) citados no item. Use os agentes por dominio
> definidos em `docs/agentes.md`.

---

## 1. Diagnostico por Tela

### 1.1 Tela de Horas (`app/horas`, `components/timesheet/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Filtro de status | Pronto | `TimesheetFilters.tsx` (dropdown DRAFT/SUBMITTED/APPROVED/REJECTED/CLOSED). |
| Filtro por projeto | Pronto | `TimesheetFilters.tsx`. |
| Filtro por atividade | Pronto | `TimesheetFilters.tsx` (ACTIVITY_TYPES de `lib/timesheet/types.ts`). |
| Editar lancamento **Enviado** ao clicar | **Ausente** | `lib/timesheet/types.ts` `isRowEditable()` so libera DRAFT/REJECTED. Enviado e somente leitura. |
| Visualizacao por periodo (data inicio/fim) | Pronto | `TimesheetFilters.tsx` (inputs de inicio e fim). |
| Visualizacao calendario (mes/semana conforme range) | Pronto | `TimesheetWeekView.tsx` `periodKind()` + `PeriodOverview` (week / month-weeks / months). |
| Hover com total de horas + status no lancamento | **Parcial** | Existe `title` nos cards do overview, mas falta tooltip real na grade semanal. |
| Cor por status + legenda (Enviado/Aprovado/Reprovado/Fechado) | Pronto | `TimesheetWeekView.tsx` `statusToneClass` + legenda. |
| Total de horas do periodo | Pronto | `TimesheetWeekView.tsx` (overview). |
| Total por projeto (apenas horas > 0) | Pronto | `TimesheetWeekView.tsx` `projectTotals`. |
| Lancamento por dia e por semana | Pronto | `TimeEntryForm.tsx` (modos Diario/Semanal). |
| Lancamento semanal replica descricao dia a dia | Pronto | `horas/actions.ts` `createWeeklyTimeEntries()`. |

**Lacunas reais:** edicao de lancamento Enviado (reabertura/edicao inline) e
tooltip de hover na grade.

### 1.2 Tela de Aprovacoes (`app/aprovacoes`, `components/approvals/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Alterar status em massa com selecao | **Parcial** | `ApprovalQueue.tsx` "Decisao em massa" so atua sobre itens **Pendentes**. |
| Mudanca em massa para outros status (alem de Pendente) | **Ausente** | Selecao filtrada por `selectedPending`; nao permite reabrir/alterar Aprovado/Reprovado. |
| Item "Auto-aprovado" alterado manualmente nao volta a auto-aprovar | **Ausente** | `Approval.isAutomatic` e gravado mas nao consultado em decisoes/reprocesso. Sem trava. |

### 1.3 Tela de Despesas (`app/despesas`, `components/expenses/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Anexo obrigatorio no lancamento | Pronto | `ExpenseForm.tsx` + `despesas/actions.ts` validam anexo no envio (SUBMITTED). |
| Anexo pode ser baixado | Pronto | `ExpensesView.tsx` `handleDownloadReceipt()` + `getReceiptUrl()`. |
| Visualizacao em tela sem baixar | **Parcial** | `ExpensesView.tsx` usa `<iframe>` com URL assinada; depende de content-type/CORS do storage e nao trata todos os formatos. |

### 1.4 Tela de Clientes (`app/clientes`, `components/clients/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Nome | Pronto | `ClientsView.tsx`. |
| Logo (upload) | **Parcial** | So aceita URL em campo texto (`logoUrl`). Sem upload de arquivo. |
| Bug: ao digitar CNPJ foco pula para botao fechar | **Investigar** | Codigo atual nao mostra a causa obvia; reproduzir e tratar foco/`onKeyDown` do modal. |
| Busca automatica por CNPJ | Pronto | `lib/cnpj/provider.ts` (BrasilAPI) + `clientes/actions.ts` `lookupCnpj()`. Habilitado via env. |
| Tipo de cobranca | Pronto | `ClientsView.tsx` (select). |
| Valor hora | Pronto | `defaultHourlyRate`. |
| Valor mensal | Pronto | `monthlyFee`. |
| Limite de horas | Pronto | `hourLimit`. |
| Regra de arredondamento | Pronto | `BillingRoundingRule` (7 opcoes). |
| Data de faturamento | Pronto | `billingDay`. |
| Dia de vencimento | Pronto | `dueDay`. |
| Tipo de NF (servico/produto) | Pronto | `InvoiceKind`. |
| Municipio | Pronto | `municipality`. |
| Aliquota de ISS | Pronto | `issRate`. |
| Regras tributarias | Pronto | `taxRules` (Json/textarea). |
| Subtela cadastro de Tipos de Cobranca | **Parcial** | CRUD existe (`BillingTypeModal`), mas `BillingChargeType` so tem 4 tipos (HOURLY, MONTHLY, CONSULTANT_HOURLY, FIXED). Faltam os outros 10 da tabela. |

**Lacunas reais:** upload de logo, bug de foco no CNPJ, e expandir os tipos de
cobranca para o catalogo completo (14 modelos).

### 1.5 Tela de Projetos (`app/projetos`, `components/projects/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Vincular consultor ao projeto (alocacao) | Pronto | `ProjectsView.tsx` `AllocationModal` + `projetos/actions.ts`. |
| Skill do consultor no projeto a partir de lista (sem vinculo direto) | **Ausente** | Nao existe `AllocationSkill`/skill por alocacao. Skills so no nivel do consultor. |
| Valor de venda por periodo (Comercial/SALES) | Pronto | `ProjectSaleRate` + `SaleRateModal` + RBAC `SALE_RATE_WRITE_ROLES`. |
| Multiplos valores de venda por periodo | Pronto | `ProjectSaleRate` com `startsAt/endsAt` e validacao de overlap. |
| Valor de venda como base de NF por hora do consultor | **Parcial** | Schema permite (`ProjectSaleRate` + `RevenueClosing`), mas o calculo NF-por-hora-consultor nao esta ligado explicitamente. |

### 1.6 Tela de Skills (`app/skills`, `components/skills/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Skill gerada por descricao entra com a descricao vinculada, status Aguardando Confirmacao | Pronto | `SkillSuggestion` (PENDING) com `evidenceSummary`/`sourceEntryIds`; `skills/actions.ts`. |
| Consultor confirma/rejeita | Pronto | `acceptSkillSuggestion()` / `dismissSkillSuggestion()`. |
| Consultor edita | Pronto | `updateSkillSuggestion()`. |
| Consultor apaga | Pronto | `deleteSkillSuggestion()` (somente PENDING). |

**Observacao:** o fluxo de skills pedido ja esta praticamente completo.

### 1.7 Tela de Consultores (`app/consultores`, `components/consultants/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Dados pessoais (nome/email/status do Entra ID) + CPF | Pronto | `Consultant` (userId do Entra) + `ConsultantPersonalInfo.cpf`. |
| Dados empresa: CNPJ + busca automatica | Pronto | `ConsultantCompanyInfo` + `lookupConsultantCnpj()`. |
| Endereco: CEP + preenchimento automatico, numero, complemento | Pronto | `ConsultantAddress` + `lookupConsultantCep()`. |
| Tipo de contratacao CLT / PJ / CLT FLEX | Pronto | `ConsultantContractType`. |
| Dados bancarios; CLT FLEX abre conta CLT e PJ | Pronto | `ConsultantBankAccount` + `ensureFlexBankAccounts()`. |
| Valor acordado: Valor/Hora, Valor CLT, Cartao Beneficio | Pronto | `ConsultantCompensation` (`hourlyRate`, `cltAmount`, `benefitCardAmount`). |
| Valor acordado: VA, VR, VT | **Parcial** | Existem como `ConsultantBenefit` (MEAL/FOOD/TRANSPORTATION_VOUCHER), nao como campos fixos no formulario de valor acordado. |
| Desconto CLT calculo automatico (FGTS, INSS etc.) | **Parcial** | `discountRules` (Json) + `computeCompensation()` calculam descontos manuais; nao ha calculadora pre-pronta de FGTS/INSS. |

### 1.8 Financeiro Receita (`app/financeiro`, `components/financial/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Status Aberto -> Em Revisao -> Pronto p/ fechar -> Fechado -> Faturado | Pronto | `RevenueClosingStatus` + `lib/db/revenue.ts` transitions + `MonthlyClosingTable.tsx`. |
| Gestor de Projeto realiza o fechamento | Pronto | `advanceRevenueClosing()` com RBAC + auditoria. |
| Financeiro verifica e clica Emitir NF | **Parcial** | UI cria draft e "Solicitar"; falta emissao real. |
| Emissao NFS-e via Web Service Prefeitura SP | **Ausente** | `lib/nfse/provider.ts` = `DisabledNfseProvider` (stub). |
| Pre-fatura | **Ausente** | Nao ha etapa/status de pre-fatura. |
| Armazena XML / PDF / numero / protocolo | **Parcial** | Campos existem em `FiscalDocument`; so `protocol` e setado. XML/PDF nunca gerados. |
| Envia e-mail ao cliente apos emissao | **Ausente** | Nao implementado. |

### 1.9 Financeiro Pagamento Consultores (`app/pagamentos`, `components/payments/*`)

| Item | Status | Evidencia / Observacao |
| --- | --- | --- |
| Status Aberto -> Aguardando NF -> ... -> Paga | Pronto | `ConsultantPaymentStatus` + `lib/payments/state-machine.ts`. |
| Filtros | **Parcial** | So mes/ano (`pagamentos/page.tsx`). Falta filtro por consultor/status/contratacao. |
| Lista (contratacao, CLT liquido, PJ, beneficios, total) | Pronto | `ConsultantPaymentsPanel.tsx`. |
| PJ: valor contratado x horas, beneficio, abertura por projeto | Pronto | `ConsultantPaymentLine` + `lib/payments/amounts.ts`. |
| CLT: valor a pagar, linhas de desconto, beneficios (VA/VR/VT/Cartao) | Pronto | `computeCompensation()` + `amounts.ts`. |
| CLT FLEX: abertura por projeto + descontos + beneficios | Pronto | `amounts.ts` (testado). |
| Email de confirmacao de valor (PJ / CLT FLEX) com abertura por projeto + previsao | **Parcial** | Botao "Previsao" + email existem; falta abertura por projeto no corpo do email. |
| Previsao de pagamento (data) / Confirmacao (data) | Pronto | `expectedPaymentAt` / `confirmedPaidAt`. |
| Subtela de cadastro de previsao (filtros, mes fechamento, prazo, data prevista) | Pronto | `PaymentForecastPanel.tsx` + `createPaymentForecast()`. |

### 1.10 Integracoes (transversal)

| Integracao | Status | Observacao |
| --- | --- | --- |
| Entra ID | Pronto | Auth.js / OAuth. |
| CNPJ (BrasilAPI) | Parcial | Habilitado por env; desligado por padrao. |
| CEP (BrasilAPI) | Parcial | Habilitado por env; desligado por padrao. |
| Email (Resend) | Parcial | Console por padrao; Resend por env. |
| Storage (Supabase) | Parcial | Habilitado quando env presente. |
| NFS-e Prefeitura SP | **Ausente** | Stub. |
| Banco | **Ausente** | Stub. |
| ERP | **Ausente** | Sem implementacao. |

---

## 2. Resumo das Lacunas (o que falta de fato)

1. **Horas:** editar lancamento Enviado; tooltip de hover na grade.
2. **Aprovacoes:** decisao em massa para qualquer status; reabertura; trava de
   reversao do "Auto-aprovado".
3. **Despesas:** visualizador em tela robusto (PDF/imagem) sem download.
4. **Clientes:** upload de logo; bug de foco no CNPJ; catalogo completo de
   tipos de cobranca (14).
5. **Projetos:** skill por consultor-no-projeto (lista, sem vinculo direto);
   ligar valor de venda a geracao de NF por hora.
6. **Consultores:** VA/VR/VT no formulario de valor acordado; calculadora
   automatica de encargos CLT (FGTS/INSS).
7. **Financeiro Receita:** integracao real NFS-e SP; pre-fatura; geracao e
   armazenamento de XML/PDF; e-mail ao cliente.
8. **Financeiro Pagamento:** filtros adicionais; abertura por projeto no email
   de confirmacao.

---

## 3. Plano de Fases

Sequencia priorizada por valor x esforco x risco. Fases curtas, cada uma com
agente dono e criterios de aceite. NFS-e fica por ultimo (maior risco e
dependencia externa).

### Fase A - Quick wins de Horas e Despesas (baixo esforco, alto uso diario)

**Escopo**
- Tooltip de hover na grade de horas (total + status).
- Editar lancamento **Enviado**: ao clicar, abrir edicao com reabertura
  controlada (status volta a DRAFT e exige reenvio; auditar).
- Despesas: visualizador em tela confiavel para PDF e imagem (fallback de
  download quando o tipo nao for visualizavel).

**Agentes:** `jump-timesheet-agent`, `jump-frontend-ux`, `jump-expenses-agent`.
**Aceite:** editar enviado gera auditoria e reset de status; hover mostra dados
corretos; preview abre PDF e imagem inline sem baixar.

### Fase B - Aprovacoes em massa e governanca de auto-aprovacao

**Escopo**
- Selecao e mudanca de status em massa para qualquer status (incl. reabrir
  Aprovado/Reprovado), com permissao por perfil.
- Trava: lancamento auto-aprovado alterado manualmente recebe marca que impede
  o motor de auto-aprovacao de reverter (consultar `isAutomatic` + flag de
  decisao manual no reprocesso).

**Agentes:** `jump-timesheet-agent`, `jump-workflow-automation`, `jump-qa-engineer`.
**Aceite:** rodar o motor 2x nao reverte decisao manual; massa funciona para
todos os status com auditoria; idempotente.

### Fase C - Clientes: cobranca completa e UX

**Escopo**
- Expandir `BillingChargeType` para o catalogo completo (14 modelos):
  Hora trabalhada, Mensalidade fixa, Hora + Fixo, Pacote de horas (Franquia),
  Por consultor alocado, Por projeto, Por entrega (Milestone), Por sprint,
  T&M, Sob demanda, Assinatura, Consumo (Pay as you go), Sucesso (Success Fee),
  Misto.
- Upload de logo do cliente (storage + preview), substituindo o campo URL.
- Corrigir bug de foco ao digitar CNPJ no modal.

**Agentes:** `jump-data-modeler` (enum + migration), `jump-billing-agent`,
`jump-frontend-ux`, `jump-integrations-agent` (storage).
**Aceite:** migration aplicada; selecao dos 14 tipos; logo carregada e exibida;
foco estavel no campo CNPJ.

### Fase D - Projetos: skill por alocacao e base de faturamento

**Escopo**
- Modelo `AllocationSkill` (ou similar): skill do consultor **no projeto** a
  partir de uma lista do catalogo, sem alterar `ConsultantSkill`.
- Ligar `ProjectSaleRate` ao calculo de NF por hora do consultor (base de
  geracao de receita para cobranca CONSULTANT_HOURLY).

**Agentes:** `jump-data-modeler`, `jump-skills-intelligence-agent`,
`jump-billing-agent`, `jump-fullstack-engineer`.
**Aceite:** tag de skill por alocacao isolada do cadastro do consultor; valor
de venda vigente alimenta linhas de receita por hora aprovada.

### Fase E - Consultores: remuneracao completa

**Escopo**
- VA, VR, VT no formulario de "Valor acordado" (mapeando para `ConsultantBenefit`).
- Calculadora automatica de encargos CLT (FGTS, INSS, e variacoes) parametrizada,
  alimentando `discountRules`/`computeCompensation()`.

**Agentes:** `jump-hr-compensation-agent`, `jump-finance-ops-agent`,
`jump-qa-engineer`.
**Aceite:** valores VA/VR/VT editaveis no cadastro; descontos CLT calculados
automaticamente e auditaveis; testes de calculo cobrindo CLT/PJ/CLT FLEX.

### Fase F - Financeiro Pagamento: filtros e email detalhado

**Escopo**
- Filtros adicionais (consultor, status, tipo de contratacao).
- Abertura por projeto (horas + valor) no corpo do email de confirmacao para
  PJ e CLT FLEX, com previsao de pagamento.

**Agentes:** `jump-payments-agent`, `jump-frontend-ux`.
**Aceite:** filtros funcionando server-side; email com tabela por projeto e
datas de previsao.

### Fase G - Financeiro Receita: pre-fatura e e-mail (sem NFS-e real)

**Escopo**
- Etapa/status de **Pre-fatura** entre Fechado e emissao.
- Geracao de pre-fatura (PDF interno) + armazenamento.
- E-mail ao cliente apos emissao (template + transporte).

**Agentes:** `jump-billing-agent`, `jump-finance-ops-agent`,
`jump-integrations-agent` (email/storage).
**Aceite:** pre-fatura visivel e armazenada; e-mail disparado e logado
(idempotente).

### Fase H - Integracao real NFS-e Prefeitura SP (maior risco)

**Escopo**
- Provider real para o Web Service oficial da Prefeitura de SP.
- Geracao/assinatura de XML, envio, captura de numero e protocolo.
- Armazenamento de XML e PDF (`FiscalDocument` + storage).
- Tratamento de erro, retry e `IntegrationEvent`.

**Agentes:** `jump-fiscal-nfse-agent`, `jump-integrations-agent`,
`jump-devops`, `jump-qa-engineer`.
**Aceite:** emissao em homologacao retorna numero/protocolo; XML/PDF
armazenados; falhas tratadas e idempotentes; auditoria completa.

---

## 4. Ordem Sugerida e Justificativa

1. **A, B** - melhoram o uso diario de horas/aprovacoes com baixo risco.
2. **C, D, E** - completam cadastros (clientes, projetos, consultores) que
   sustentam o financeiro.
3. **F, G** - amadurecem o financeiro sem dependencia externa critica.
4. **H** - NFS-e real por ultimo: maior risco, dependencia de homologacao da
   Prefeitura e de certificado digital.

> Itens marcados como **Pronto** na secao 1 nao entram nas fases; servem como
> base. Reconfirme com testes manuais antes de marcar uma fase como concluida.
</content>
</invoke>
