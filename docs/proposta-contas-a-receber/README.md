# Proposta de Ajustes — Contas a Receber (Financeiro)

> **Fonte:** `Proposta de Ajustes na Plataforma.docx` (Financeiro — Vitória Henrique).
> **Status:** ✅ **Implementado** (Waves A–F + 2 waves de correção + re-review). Itens 1–7 prontos; gates verdes (`tsc`/`build`/71 testes); bug ALTO de e-mail duplicado eliminado e reconfirmado. **Mergeado na `main`** (merge `5596422`, 2026-07-25) → auto-deploy Vercel; sem migration. Item 8 (Acompanhamento de Projetos) permanece como wave separada. Ver §7 Follow-ups.
> **Data da análise:** 2026-07-24.
> **Escopo:** aba **Contas a Receber** do módulo **Financeiro**, + Tela Inicial por setor + card de Acompanhamento de Projetos (à parte).

Os _mockups_ originais estão em [`./assets`](./assets) (01–05). Este documento é a fonte de verdade para os agentes de desenvolvimento.

---

## 0. Decisões fechadas (2026-07-24)

1. **Substituição da tela.** A nova jornada **substitui** a visão atual da aba Contas a Receber (`MonthlyClosingTable`). Continua existindo como jornada coesa: `filtrar → lançamentos por dia → apurar → enviar`.
2. **Tipos de atividade.** **Não** haverá "Hora Extra" como tipo. Usar **apenas os tipos existentes** (`WORKDAY` = Dia Útil, `ON_CALL` = Sobreaviso, etc. de `src/lib/timesheet/types.ts`).
3. **Coluna "Faturar?".** Único ponto **editável** da tela. Deriva do **Faturável** definido na **aprovação de horas** (`TimeEntry.billable`) e pode ser alternada aqui, **reaproveitando a action existente `setEntryBillable`** (com sua regra de justificativa/auditoria).
4. **"Enviar Apuração" = "Enviar cliente" atual.** Reaproveita o fluxo de **pré-fatura por e-mail** (`sendPreInvoiceEmail`), que **exige o fechamento em status `CLOSED`** e faz dedupe/idempotência via `AutomationEmailLog`. **O fechar é passo separado do Gerente de Área** (ver "Fechar × Enviar" abaixo).
5. **Export "Timesheet" = export da tela Relatórios.** Reaproveitar o export de horas de Relatórios (`/api/relatorios/horas/xlsx`), **respeitando os filtros da tela** (período/cliente/projeto).
6. **Multi-projeto.** O filtro de Projeto é **multi-seleção (combo box)**. Em "Ver Apuração", cada projeto aparece **empilhado (um abaixo do outro)**. O botão "Enviar Apuração" de um projeto já enviado vira **"Apuração Enviada"**, mas continua clicável para reenviar, exibindo o alerta **"Apuração já enviada, deseja enviar novamente?"**.
7. **NFS-e / ciclo de status / exceções: fora do escopo desta iteração.** A emissão de NFS-e, a máquina de status completa e o painel de exceções **saem** do escopo agora (tratados numa etapa futura).
8. **Período por data.** Filtro por **data inicial/final** (range), não Mês/Ano.

### Fechar × Enviar (decisões 4 + 7 — atualizado 2026-07-24)
Enviar exige `CLOSED`, mas a UI de gestão de status sai do escopo. **Decisão final:** o **fechar** é um passo **separado e explícito do Gerente de Área**; o **enviar** (Financeiro) só habilita depois.

> - **Fechar (Liberar faturamento)** — ação `fecharApuracao`, gate **ADMIN/AREA_MANAGER** (não FINANCE puro). Faz *generate-if-missing* e leva o(s) `RevenueClosing` da(s) competência(s) até `CLOSED` (SUBMIT_REVIEW→MARK_READY→CLOSE via `advanceRevenueClosing`), usando **Observações** como justificativa. É aqui — no fechamento intencional — que a notificação `HOURS_RELEASED` (People+Finance) dispara.
> - **Enviar Apuração** — ação `enviarApuracao`, gate **FINANCIAL_ROLES**. **Não fecha nada.** Exige a competência já `CLOSED`; caso contrário retorna `NOT_CLOSED` ("Aguardando fechamento pelo Gerente de Área.") e o botão fica desabilitado.
>
> Apenas a transição `CLOSE` é exposta (para o Gerente de Área). Nenhuma outra (MARK_INVOICED, reverts) nem NFS-e nesta iteração.

**Reenvio por competência:** `enviarApuracao` reenvia **somente** as competências explicitamente confirmadas (`resendCompetences`), nunca competências recém-enviadas no mesmo fluxo (corrige bug de e-mail duplicado).

**Sem migration prevista:** o estado "Apuração Enviada" deriva de `AutomationEmailLog` (tipo `PRE_INVOICE`); Observações vão no payload do envio/close (sem nova coluna). Confirmar na Wave A; se persistência dedicada for necessária, avaliar migration então.

---

## 1. Resumo das melhorias

| # | Melhoria | Essência | Mockup |
|---|----------|----------|--------|
| 1 | **Tela Inicial por setor** | Cards centralizados por setor (*Contas a Receber* / *Contas a Pagar*) para o perfil Financeiro. | [01](./assets/01-tela-inicial-cards.png) |
| 2 | **Filtros do Contas a Receber** | Período (data inicial/final), Cliente, Projeto (**multi**) + *Pesquisar*; cards-resumo (Horas no período, Valor a faturar, Alocados). | [02](./assets/02-filtros-resumo.png) |
| 3 | **Lançamentos por dia** | Lançamentos agrupados por dia, com total de horas por dia (seções colapsáveis). | [03](./assets/03-lancamentos-por-dia.png) |
| 4 | **Informações dos alocados** | Colunas: Alocado, Projeto, Tipo de Atividade (existentes), Horas, Anexo, **Faturar?** (editável). | [03](./assets/03-lancamentos-por-dia.png) |
| 5 | **Exportar Timesheet (Excel)** | Reaproveitar o export de Relatórios com os filtros da tela. | [03](./assets/03-lancamentos-por-dia.png) |
| 6 | **Tela de Apuração** | Resumo por alocado (Horas × Valor de Venda = Valor Total), Totais, Observações; multi-projeto empilhado. | [04](./assets/04-apuracao.png) |
| 7 | **Enviar Apuração** | = "Enviar cliente"/pré-fatura; garante `CLOSED`; estado "Apuração Enviada" + reenvio com confirmação; tela de sucesso. | [05](./assets/05-envio-sucesso.png) |
| 8 | **(À parte) Acompanhamento de Projetos** | Card com indicadores e % de progresso de horas por projeto. | — |

---

## 2. Estado atual (referências de código)

App em `apps/web/`. Paths repo-relative.

- **Launcher/home:** [`src/app/app/page.tsx`](../../apps/web/src/app/app/page.tsx), [`src/components/launcher/LauncherView.tsx`](../../apps/web/src/components/launcher/LauncherView.tsx), [`src/lib/launcher.ts`](../../apps/web/src/lib/launcher.ts).
- **Financeiro (página):** [`src/app/app/financeiro/page.tsx`](../../apps/web/src/app/app/financeiro/page.tsx) — gate `requireRole(FINANCIAL_ROLES)`.
- **Abas / overview:** [`src/components/financial/FinanceTabs.tsx`](../../apps/web/src/components/financial/FinanceTabs.tsx), [`src/components/financial/FinancialOverview.tsx`](../../apps/web/src/components/financial/FinancialOverview.tsx).
- **Tabela a ser substituída (receber):** [`src/components/financial/MonthlyClosingTable.tsx`](../../apps/web/src/components/financial/MonthlyClosingTable.tsx).
- **Actions financeiro:** [`src/app/app/financeiro/actions.ts`](../../apps/web/src/app/app/financeiro/actions.ts) — `sendPreInvoiceEmail` (linhas ~916–1085), `advanceRevenueClosing` (~179–300), `loadClosingApuracao` (~355–400), `buildProjectHoursAttachment` (~835–899), `resolveBillingRecipients` (~811–823).
- **Relatórios (export a reusar):** rota XLSX [`src/app/api/relatorios/horas/xlsx/route.ts`](../../apps/web/src/app/api/relatorios/horas/xlsx/route.ts); colunas [`src/lib/reports/xlsx-columns.ts`](../../apps/web/src/lib/reports/xlsx-columns.ts) (`hoursXlsxColumns`); dados `getHoursReport` ([`src/lib/db/reports.ts`](../../apps/web/src/lib/db/reports.ts)); filtros [`src/lib/reports/schemas.ts`](../../apps/web/src/lib/reports/schemas.ts) (`hoursReportFilterSchema` — suporta `from`/`to`/`clientId`/`projectId`/`consultantId`/`billable`/`activityType`/`status`).
- **Faturar (toggle) existente:** `setEntryBillable` em [`src/app/app/horas/actions.ts`](../../apps/web/src/app/app/horas/actions.ts) (~1589–1699); regra `resolveBillableDecision` (~143–186); auditoria `TIME_ENTRY_MARKED_NON_BILLABLE`/`TIME_ENTRY_BILLABLE_CHANGED`; anexo assinado `getTimeEntryAttachmentUrl`.
- **Taxas de venda:** `resolveSaleRate` em [`src/lib/projects/rates.ts`](../../apps/web/src/lib/projects/rates.ts) (`ProjectSaleRate` → fallback `Project.billingHourlyRate`); horas efetivas [`src/lib/timesheet/effective-hours.ts`](../../apps/web/src/lib/timesheet/effective-hours.ts).
- **Montagem de receita:** [`src/lib/db/revenue.ts`](../../apps/web/src/lib/db/revenue.ts) (`listRevenueClosings`, `getRevenueClosingForPreInvoice`, `revenueClosingTransitions`, `preInvoiceReferenceKey`).
- **Pré-fatura / e-mail:** [`src/lib/billing/pre-invoice.ts`](../../apps/web/src/lib/billing/pre-invoice.ts), templates em `src/lib/automation/email/`, dedupe `AutomationEmailLog` (`PRE_INVOICE`), regra `PRE_INVOICE_ISSUED` (`resolveEventDelivery`).
- **Tipos de atividade:** [`src/lib/timesheet/types.ts`](../../apps/web/src/lib/timesheet/types.ts) (`ACTIVITY_TYPES`, `activityLabels`).
- **Export helpers:** [`src/lib/export/xlsx.ts`](../../apps/web/src/lib/export/xlsx.ts); [`src/lib/financial/financeiro-export.ts`](../../apps/web/src/lib/financial/financeiro-export.ts).
- **RBAC:** `FINANCIAL_ROLES` em [`src/lib/auth/route-permissions.ts`](../../apps/web/src/lib/auth/route-permissions.ts); guards em [`src/lib/auth/guards.ts`](../../apps/web/src/lib/auth/guards.ts).

---

## 3. Detalhamento por item

### Item 1 — Tela Inicial por setor
**Mockup:** [01](./assets/01-tela-inicial-cards.png).
- Para `FINANCIAL_ROLES`, apresentar cards **por setor** centralizados: *Contas a Receber* (`/app/financeiro?tab=receber`) e *Contas a Pagar* (`/app/financeiro?tab=pagar`).
- Reaproveitar `LauncherView`/`launcher.ts` com um segmento "setores financeiros"; badges via `getLauncherBadges`. Não alterar a home dos demais perfis.
- **Aceite:** usuário FINANCE vê 2 cards de setor centralizados; clique abre a aba correta; demais perfis inalterados.

### Item 2 — Filtros + cards-resumo
**Mockup:** [02](./assets/02-filtros-resumo.png).
- Filtros: **Período (from/to)**, **Cliente**, **Projeto multi-seleção**, botão **Pesquisar**. Sem filtro de Status na barra.
- Cards-resumo do recorte: **Horas no período** (Σ horas efetivas APPROVED+billable), **Valor a faturar** (Σ horas × valor de venda), **Alocados** (nº consultores distintos).
- Reaproveitar `hoursReportFilterSchema` (from/to). Projeto multi escopado ao(s) cliente(s).
- **Aceite:** aplicar filtros recarrega a consulta; cards refletem exatamente o recorte.

### Item 3 — Lançamentos por dia
**Mockup:** [03](./assets/03-lancamentos-por-dia.png).
- Buscar `TimeEntry` APPROVED via `getHoursReport`, **agrupar por data**; cabeçalho por dia com **total de horas do dia** (usar `timeEntryEffectiveHours`); seções **colapsáveis**.
- **Aceite:** cada dia com lançamentos vira grupo colapsável ordenado por data, total do dia correto.

### Item 4 — Informações dos alocados
**Mockup:** [03](./assets/03-lancamentos-por-dia.png).
- Colunas por lançamento: **Alocado** (avatar+nome), **Projeto**, **Tipo de Atividade** (chip a partir de `activityLabels` — apenas tipos existentes), **Horas** (HH:MM), **Anexo** (abre via `getTimeEntryAttachmentUrl`), **Faturar?** (toggle).
- **Faturar? editável:** alterna `TimeEntry.billable` via **`setEntryBillable`** existente (respeita gate `BILLABLE_MANAGER_ROLES`, exige `nonBillableReason` ao desmarcar lançamento normal, audita, bloqueia `CLOSED`). Sem duplicar lógica.
- Regra visual do rodapé do mockup ("Sobreaviso exige anexo de aprovação do gestor") — sinalizar pendência quando faltar anexo (apenas visual; não bloqueia nesta iteração).
- **Aceite:** 6 colunas corretas; total do dia bate; anexos abrem; toggle Faturar persiste e audita reusando a action atual.

### Item 5 — Exportar Timesheet
**Mockup:** [03](./assets/03-lancamentos-por-dia.png) (botão "Exportar Timesheet").
- Reaproveitar o export **XLSX de Relatórios** (`/api/relatorios/horas/xlsx`, `hoursXlsxColumns`), montando a `href` com os **filtros atuais da tela** (from/to/clientId/projectId; status=APPROVED). Para multi-projeto, ver comportamento de `projectId` (o schema aceita 1; avaliar múltiplas chamadas ou omitir projeto para exportar o recorte cliente+período). Definir na Wave B.
- **Aceite:** exporta `.xlsx` no layout de Relatórios respeitando os filtros; export auditado (a rota já audita `HOURS_EXPORTED`).

### Item 6 — Tela de Apuração
**Mockup:** [04](./assets/04-apuracao.png).
- Botão **Ver Apuração** leva à apuração (rota dedicada, ex.: `/app/financeiro/apuracao`, preservando filtros na query).
- Para **cada projeto** selecionado (empilhados): **Resumo dos alocados** (Alocado, Total de Horas, **Valor/Hora (Venda)** via `resolveSaleRate`, **Valor Total** = Horas × Valor Venda); cards **Total de horas do período** e **Total a faturar**; campo **Observações (opcional)**; botões **Exportar Excel** (resumo apurado) e **Enviar Apuração**.
- **Precedência de valor de venda:** `resolveSaleRate` (`ProjectSaleRate` vigente → fallback `Project.billingHourlyRate`).
- **Aceite:** valores por alocado corretos; totais consistentes com os cards do item 2; multi-projeto empilhado; observações capturadas.

### Item 7 — Enviar Apuração
**Mockup:** [05](./assets/05-envio-sucesso.png).
- Ação **por projeto**. Reaproveita a infra de pré-fatura (`sendPreInvoiceEmail` + `buildPreInvoice` + `AutomationEmailLog` + `AuditEvent`).
- **Fechar é passo separado (Gerente de Área):** a jornada expõe uma ação **Fechar / Liberar faturamento** (`fecharApuracao`, gate ADMIN/AREA_MANAGER) que leva a competência a `CLOSED`. **Enviar Apuração** (FINANCIAL_ROLES) **não fecha** — fica **desabilitado** até `CLOSED`, exibindo "Aguardando fechamento pelo Gerente de Área."
- **Estado:** se `AutomationEmailLog` (PRE_INVOICE) já `SENT`, o botão exibe **"Apuração Enviada"**; ao clicar de novo, confirmar **"Apuração já enviada, deseja enviar novamente?"** e então reenviar (upsert do log).
- **Multi-competência:** resolver o(s) `RevenueClosing` do projeto para o(s) mês(es) sobrepostos ao período; enviar por competência.
- **Sucesso:** exibir tela/estado de confirmação (Período/Cliente/Projeto + "Voltar para Contas a Receber").
- Degradar honestamente em `NO_CONTACT_EMAIL` (orientar cadastrar e-mail do cliente).
- **Aceite:** envia uma vez (idempotente); reenvio só via confirmação; auditado; confirmação exibida; sem e-mail duplicado silencioso.

### Item 8 — (À parte) Acompanhamento de Projetos
**Sem mockup. Wave separada — não bloqueia 1–7.**
- Card em Contas a Receber e Contas a Pagar: filtros (Período, Cliente, Projeto + Pesquisar); indicadores (Projetos Totais/Concluídos/Em Andamento); tabela (Projeto, Cliente, Horas Previstas, Horas Realizadas, % Progresso); drill-down (previstas/realizadas/saldo/% /nº consultores).
- Base: `Project.budgetHours` (previstas), horas realizadas via time entries; verificar `PROJECT_TRACKING_*` (route-permissions) antes de construir.
- **Aceite:** indicadores e tabela corretos; drill-down por projeto.

---

## 4. Plano de orquestração (waves)

Devido ao forte acoplamento de arquivos (uma única tela + actions compartilhadas), as waves de implementação rodam **em sequência**, com _gate_ de `tsc` + `next build` entre elas (vitest da máquina é flaky — ver memória).

| Wave | Responsável | Entrega | Depende de |
|------|-------------|---------|------------|
| **A — Backend/domínio** | `jump-finance-ops-agent` | Camada de dados da jornada (lançamentos por dia, resumo, apuração por alocado com `resolveSaleRate`, multi-projeto) + action `enviarApuracao` (garante CLOSED + `sendPreInvoiceEmail` + estado/reenvio) + dados do export da apuração. Testes unitários dos cálculos. **Sem UI.** | — |
| **B — UI da jornada** | `jump-fullstack-engineer` (+ `jump-frontend-ux`) | Substitui a aba Contas a Receber: filtros (range + Projeto multi) + cards-resumo + lançamentos por dia colapsáveis + colunas (incl. toggle Faturar via `setEntryBillable` + anexo) + botão Exportar Timesheet (href Relatórios) + botão Ver Apuração. | A |
| **C — Apuração + Envio** | `jump-fullstack-engineer` (+ `jump-finance-ops-agent`) | Tela de Apuração (multi-projeto empilhado, resumo por alocado, totais, observações, Exportar Excel) + Enviar Apuração (estado "Apuração Enviada" + confirmação de reenvio) + tela de sucesso. | A, B |
| **D — Tela Inicial por setor** | `jump-operational-launcher-agent` (+ `jump-frontend-ux`) | Cards por setor para FINANCE. (Isolada — pode rodar em paralelo à C.) | — |
| **E — QA** | `jump-qa-engineer` | Cenários críticos + testes (cálculo de apuração, garantia de CLOSED, idempotência/reenvio, RBAC, toggle Faturar). | A–D |
| **F — Code review** | `jump-code-reviewer` | Revisão final (bugs, RBAC, dados, regressão). | A–E |
| **G — (separada) Acompanhamento de Projetos** | `jump-product-owner` → impl. | Item 8, após 1–7. | — |

**Fora deste ciclo (etapa futura):** reintroduzir NFS-e, máquina de status completa e painel de exceções sobre a nova jornada.

---

## 5. Suficiência dos agentes

Os agentes disponíveis **cobrem todo o ciclo** (produto→dados→backend→frontend→finanças→QA→review→devops). Mapeamento: escopo/critérios → `jump-product-owner`; cálculo de valor de venda/pré-fatura/envio → `jump-finance-ops-agent`/`jump-billing-agent`; implementação → `jump-fullstack-engineer`; UX/telas → `jump-frontend-ux`; home por setor → `jump-operational-launcher-agent`; testes → `jump-qa-engineer`; revisão → `jump-code-reviewer`; deploy → `jump-devops`. **Não há lacuna de capacidade.** `jump-data-modeler` só entra se a Wave A concluir que precisa de migration (não previsto).

---

## 7. Follow-ups conhecidos (fora deste ciclo)
- **Item 8 — Acompanhamento de Projetos** (card com indicadores/% de progresso): não construído; wave separada.
- **Testes de regressão do reenvio por competência:** o fix ALTO foi confirmado por review + gates, mas falta cobertura automatizada (integração de `enviarApuracao`: 2ª chamada com `resendCompetences` parcial não reenvia a competência recém-enviada; `NOT_CLOSED` não envia; RBAC de `fecharApuracao`). Recomendado adicionar.
- **UX reenvio multi-competência parcial:** pode encadear múltiplos prompts de confirmação; polir semeando `pendingResend` com todas as competências elegíveis ou detalhando no texto do modal.
- **Subfaturamento por taxa ausente / cobrança não-horária:** hoje sinalizado na UI; avaliar exibir `closing.totalAmount` quando a cobrança for não-horária.
- **BAIXO #8:** projetos de cobrança fixa **sem** horas billable não aparecem na jornada (só há card quando há `TimeEntry` APPROVED).
- **BAIXO #9 (pré-existente):** anexo da pré-fatura usa horas brutas; corpo/total usa horas efetivas — pode divergir em ON_CALL/multiplier≠1.
- **Badge do card "Contas a Receber"** (home por setor): reusa o contador `financeiro` (despesas a pagar); criar contador dedicado de "fechamentos prontos".
- **Etapa futura:** reintroduzir NFS-e, máquina de status completa e painel de exceções sobre a nova jornada.

## 6. Referências
- Mockups: [`./assets`](./assets) (01–05). Código atual: §2.
- Docs: `docs/plano-melhorias-financeiro-operacional.md`, `docs/relatorios-fechamento.md`, `docs/horas-operacional-filtros.md`, `docs/migracao-plataforma-horas.md`.
