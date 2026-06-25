# Plano de Melhorias — Financeiro & Operacional

> Status: proposta · Criado em 2026-06-22 · Branch de origem: `feat/talentos-desenvolvimento`
> Fontes: anotações de melhoria do produto + auditoria do código atual (financeiro, notificações, projetos, aprovação, pagamento).

Este documento organiza as anotações de melhoria em **7 oportunidades**, propõe um **plano de implementação em 5 ondas** e registra as **pendências arquiteturais** que precisam ser resolvidas para sustentar a implementação.

---

## 1. Contexto

A base financeira do JumpFlow já é madura. Antes de qualquer construção, vale registrar o que **já existe**, para não reescrever fundação:

| Capacidade | Estado | Onde |
|---|---|---|
| Faturamento / fechamento de receita | Completo | `lib/db/revenue.ts`, `RevenueClosing*` |
| Status "Faturado" restrito ao Financeiro | Completo (`INVOICED` exige `FINANCIAL_ROLES` + NFS-e emitida) | `route-permissions.ts` |
| Valor-hora por projeto/consultor/alocação com vigência | Completo | `ProjectSaleRate`, `lib/projects/rates.ts` |
| Pagamento de consultores + state machine + forecast | Completo | `ConsultantPayment*`, `lib/payments/` |
| Contas bancárias por tipo de contrato | Completo | `ConsultantBankAccount` |
| Transporte de e-mail plugável (Resend) + log idempotente | Completo | `lib/automation/email-transport.ts`, `AutomationEmailLog` |
| Cron / jobs agendados com auth | Completo | `vercel.json`, `/api/jobs/*`, `lib/automation/job-auth.ts` |
| Anexos com storage privado (Supabase) | Completo | `StorageProvider`, `ExpenseAttachment`, `ConsultantDocument` |
| Auditoria de mudanças sensíveis (helper) | Parcial (helper pronto, não cabeado em tudo) | `lib/db/audit.ts` |
| % de andamento do projeto (derivado) | Pronto para derivar (não materializado) | `lib/db/projects.ts` (`consumedHours`/`budgetHours`) |

**Conclusão:** as melhorias são majoritariamente **camadas sobre fundações existentes**. Os dois grandes gaps de produto — **motor de notificações configurável** e **painel de margem/PR** — não têm equivalente hoje, mas ambos se apoiam em dados que já existem.

---

## 2. Oportunidades de melhoria

### Tema 1 — Notificações de liberação e faturamento
Motor configurável de e-mail/Teams para eventos operacionais.
- 1.1 Notificação por liberação (e-mail / Teams).
- 1.2 E-mail de apuração ao cliente, **totalizador por consultor**.
- 1.3 Granularidade do disparo: **por alocação** e **por projeto**.
- 1.4 Remetente = e-mail do **gestor do projeto**.
- 1.5 **Agrupamento por destinatário** (um e-mail consolidado por pessoa).
- 1.6 Cadastro de **múltiplos e-mails** para aprovação de NF.

### Tema 2 — Regras de cobrança e hora extra
- 2.1 Regra de cobrança em **período de férias** (e-mail opcional).
- 2.2 Status "Faturado" **apenas pelo Financeiro** — *já implementado, validar/documentar*.
- 2.3 Cobrança de **valor por hora extra excedente**.
- 2.4 **% sobre a hora extra** configurável por **PJ, CLT ou ambos**.
- 2.5 **Alerta de hora extra** separado por **PJ e CLT**.

### Tema 3 — Exceções, anexos e transparência na liberação
- 3.1 Em **sobreaviso e hora extra**: campo de **anexo com o "ok" do responsável**, exibido em tela.
- 3.2 **Mostrar as exceções** da liberação (HE, sobreaviso, etc.).

### Tema 4 — Projeto ↔ faturamento
- 4.1 Vincular faturamento ao **% de andamento** do projeto.
- 4.2 **Notificação de faturamento** para projeto, comercial e Financeiro.
- 4.3 **Cobrança periódica** do faturamento não realizado.
- 4.4 **Previsão de faturamento** (forecast).
- 4.5 **Projeto sem consultor vinculado** → previsão de pagamento + **liberação automática para faturamento** + status Faturado.

### Tema 5 — Pagamento
- 5.1 **Forma de pagamento** (modelo já existe; ajuste de UI).
- 5.2 **Previsão de pagamento** — *já implementado (`ConsultantPaymentForecast`)*.

### Tema 6 — Cadastro de projeto e contrato comercial
- 6.1 Ao **cadastrar novo projeto**, notificar Financeiro e comercial.
- 6.2 **Vincular contrato comercial** ao projeto e **alertar comercial quando ausente**.

### Tema 7 — Margem e rentabilidade do projeto (PR)
- 7.1 **Custo por consultor** no projeto.
- 7.2 **Previsão de receita** do projeto.
- 7.3 **Margem esperada** (receita prevista − custos), com RBAC financeiro.

---

## 3. Plano de implementação (5 ondas)

Ordenado por **dependência técnica** e **valor destravado**. As fundações transversais vêm primeiro.

### Onda 1 — Fundação: Motor de Notificações configurável
*Destrava os temas 1, 4.2 e 6 por completo. Sem isso, cada notificação vira código avulso.*

| # | História | Agentes |
|---|---|---|
| 1.1 | Modelo `NotificationRule` (evento → nível alocação/projeto → destinatários → canal → agrupamento) + cadastro de múltiplos e-mails (`NotificationRecipient`) | data-modeler, architect |
| 1.2 | Serviço de despacho que **agrupa por destinatário** antes de enviar (reusa `email-transport.ts` + `AutomationEmailLog`) | workflow-automation |
| 1.3 | Conector **Teams** (webhook) como segundo canal — *infra net-new, ver §4* | integrations-agent |
| 1.4 | UI de regras + e-mails de destino (inclui os "vários e-mails p/ aprovação de NF") | frontend-ux |

### Onda 2 — Notificações de negócio sobre o motor
| # | História | Agentes |
|---|---|---|
| 2.1 | E-mail/Teams **por liberação** (hook no fluxo de aprovação existente) | workflow-automation |
| 2.2 | E-mail de **apuração ao cliente, totalizador por consultor** (reusa `RevenueClosingLine`) | billing-agent |
| 2.3 | Granularidade por alocação / projeto; remetente = gestor | workflow-automation |
| 2.4 | Notificar **criação de projeto** → Financeiro + comercial (tema 6.1) | workflow-automation |

### Onda 3 — Hora extra, sobreaviso e exceções
*Independente das notificações; tem decisão de modelo de dados.*

| # | História | Agentes |
|---|---|---|
| 3.1 | Modelar **Sobreaviso** (`OnCallEntry`: data, horas, multiplicador, consultor) — inexistente hoje | data-modeler |
| 3.2 | **% sobre HE por vínculo (PJ/CLT/ambos)** e cobrança de HE excedente | billing-agent, hr-compensation-agent |
| 3.3 | **Alertas de HE separados PJ/CLT** (job + motor da Onda 1) | workflow-automation |
| 3.4 | **Anexo "ok do responsável"** em HE/sobreaviso (reusa `StorageProvider`) + **exibir exceções** na liberação | frontend-ux, finance-ops |
| 3.5 | Regra de **cobrança em férias** com e-mail opcional | billing-agent |

### Onda 4 — Margem / Painel PR
*Maior valor de gestão. **Pré-requisito bloqueante**: popular os custos (ver §4, P1).*

| # | História | Agentes |
|---|---|---|
| 4.0 | **UI/import para gravar `ConsultantAllocationCostRate`** (hoje nunca é escrito → margem = null) | fullstack, hr-compensation-agent |
| 4.1 | Consolidar engine de margem custo×receita por consultor/projeto (reaproveitar `project-risk.ts`) | finance-ops-agent |
| 4.2 | **Previsão de faturamento** (modelo de receita prevista vs. realizada) | data-modeler, billing |
| 4.3 | **Painel PR**: custo por consultor + receita prevista → margem esperada, com RBAC financeiro | finance-ops-agent, frontend-ux |

### Onda 5 — Ciclo de faturamento e contrato comercial
| # | História | Agentes |
|---|---|---|
| 5.1 | Vincular **% de andamento ao faturamento** (gatilho/sugestão por progresso) | billing-agent |
| 5.2 | **Cobrança periódica de faturamento não realizado** (cron + motor de notificações) | workflow-automation |
| 5.3 | **Projeto sem consultor** → previsão de pagamento + **liberação automática** + status Faturado | billing-agent |
| 5.4 | Entidade **Contrato Comercial** vinculada ao projeto + **alerta quando ausente** | architect, data-modeler |

---

## 4. Pendências arquiteturais

Itens que precisam ser resolvidos para a implementação acontecer sem retrabalho. Severidade: **P1 bloqueante**, **P2 necessário**, **P3 conveniente**.

### P1 — Custos de alocação nunca são gravados (bloqueia Onda 4)
- **Achado:** o modelo `ConsultantAllocationCostRate` existe e a margem **já é calculada** em [project-risk.ts](apps/web/src/lib/db/project-risk.ts), mas **não há nenhuma UI/action que grave custos** — só há `deleteMany` ao remover alocação. Sem dado, `avgCost` é `null` e a margem nunca aparece.
- **Resolução:** implementar a história **4.0** (UI/import de custo por consultor-alocação com vigência) **antes** de 4.1/4.3. É o primeiro passo da Onda 4, não um detalhe.

### P1 — Sem infraestrutura de webhook de saída (bloqueia canal Teams)
- **Achado:** só existe transporte de e-mail. Não há dispatcher HTTP/webhook genérico; `IntegrationProviderKind` não tem `TEAMS`/`WEBHOOK`.
- **Resolução:** criar `lib/automation/webhook-transport.ts` (espelho de `email-transport.ts`), payload de Adaptive Card do Teams, e registrar tentativas via `IntegrationEvent` (+ valor de enum). Net-new. **Pode ser adiado:** entregar a Onda 1 com canal e-mail e plugar Teams como incremento (1.3).

### P2 — `AutomationConfig` não comporta regras por evento
- **Achado:** `AutomationConfig` é um singleton voltado só a auto-aprovação + e-mail de relatório. Não há onde armazenar "evento → destinatário → canal".
- **Resolução:** novo modelo `NotificationRule`/`NotificationRecipient` (história 1.1). Não tentar espremer em JSON no singleton — vira dívida.

### P2 — Sem engine de templates de e-mail
- **Achado:** corpos de e-mail são strings montadas à mão por chamada; sem HTML/template. O "e-mail de apuração ao cliente por consultor" (1.2) pede layout tabular.
- **Resolução:** adicionar `lib/automation/templates/*` (funções puras que retornam `EmailMessage`). Resend já aceita corpo HTML. Avaliar `react-email`/`mjml` se a demanda de layout crescer.

### P2 — Previsão de faturamento não existe
- **Achado:** `RevenueClosing` é **realizado**, não previsto. Não há modelo de forecast de receita.
- **Resolução:** novo modelo de receita prevista (história 4.2), que alimenta tanto o tema 4.4 quanto o painel PR (7.2).

### P2 — Sobreaviso não modelado
- **Achado:** hora extra tem `ConsultantHourBankEntry`; **sobreaviso não existe** em lugar nenhum.
- **Resolução:** novo modelo `OnCallEntry` (história 3.1) antes das regras de cobrança/anexo de sobreaviso.

### P2 — Sem entidade de Contrato Comercial
- **Achado:** o `Project` acumula papel de contrato; termos comerciais vivem em `ProjectBillingConfig`. Não há entidade de contrato separada.
- **Resolução:** decisão arquitetural (história 5.4). Avaliar custo/benefício de separar contrato de projeto vs. adicionar campos comerciais ao projeto. **Maior decisão de arquitetura do conjunto** — endereçar com ADR.

### P3 — Auditoria não cabeada em todos os fluxos sensíveis
- **Achado:** `recordAuditEvent()` existe e funciona, mas é chamado só em alocação/sale-rate. Mudanças novas (override de aprovação, custo, status de faturamento) precisam chamar explicitamente.
- **Resolução:** ao implementar cada ação sensível das ondas, adicionar a chamada de auditoria. Sem middleware automático — é responsabilidade de cada ação.

### P3 — Exceções de auto-aprovação ainda não no schema
- **Achado:** docs mencionam `AutoApprovalException` (any-hours, weekend), mas **não está no Prisma**. Relevante para "mostrar exceções da liberação" (3.2).
- **Resolução:** modelar junto da Onda 3 se a UI de exceções for surfaçar esses casos.

### Itens já prontos (sem pendência)
- **Cron/jobs:** padrão claro e seguro — alertas de HE (3.3) e cobrança periódica (5.2) seguem `/api/jobs/*` + `vercel.json`.
- **RBAC financeiro:** padrão `includeFinancials` consistente — aplicar nas novas queries de margem.
- **% andamento:** `consumedHours`/`budgetHours` já agregam — base para 4.1.
- **Storage de anexos:** `StorageProvider` pronto — reusar para o anexo de HE/sobreaviso (3.4).

---

## 5. Gates e pré-requisitos de entrega

- **Migrations:** Ondas 1, 3, 4 e 5 alteram o schema Prisma. Rodar `npm run db:deploy` na base de produção **antes** de mergear PRs de migration na `main` (o build da Vercel **não** roda migrate deploy).
- **Ordem recomendada:** Onda 1 → 2 → (3 e 4 em paralelo) → 5. A Onda 1 é o gargalo de valor — implementá-la primeiro evita reescrever o despacho de e-mail em cada feature.
- **ADR pendente:** entidade de Contrato Comercial (P2/5.4) deve ter ADR antes da implementação.
- **Revisão:** usar `jump-code-reviewer` antes de fechar cada onda; `jump-qa-engineer` para cenários críticos de cobrança/HE.

---

## 6. Resumo de prioridade

| Onda | Valor | Risco/esforço | Bloqueios |
|---|---|---|---|
| 1 — Motor de notificações | Alto (destrava 3 temas) | Médio | Novo modelo (P2) |
| 2 — Notificações de negócio | Alto | Baixo | Depende da Onda 1; templates (P2) |
| 3 — HE / sobreaviso / exceções | Médio-alto | Médio | Modelar sobreaviso (P2) |
| 4 — Margem / PR | **Mais alto (gestão)** | Médio | **Popular custos (P1)**, forecast (P2) |
| 5 — Faturamento / contrato | Médio | Alto (contrato = ADR) | Contrato comercial (P2) |
