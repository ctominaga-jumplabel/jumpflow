# ADR 0003 — Integração CRM-Jumplabel → JumpFlow (Fase 1: ingestão)

- **Status:** Aceito — Fase 1 em implementação
- **Data:** 2026-07-15
- **Contexto técnico:** `integracao-crm-jumplabel/respostas-jumpflow-fase1.md`,
  `contrato-v1.md`, `descoberta.md` (repositório do CRM). Decisões já congeladas
  nesses documentos; este ADR as registra, não as re-decide.

## Contexto

O CRM-Jumplabel é a fonte da verdade da **venda** (escopo contratado, perfis,
horas orçadas, valores); o JumpFlow é a fonte da verdade da **execução e da
economia** do projeto (horas lançadas, custo, valor de venda com vigência,
margem, faturamento). O JumpFlow **não é greenfield**: já tem `Project`,
`ProjectSaleRate`, `Allocation`, `IntegrationEvent` idempotente, `BillingType`,
cálculo de margem e RBAC de custo. A integração **mapeia o payload do CRM para
esse modelo rico já existente**, não desenha um receptor do zero.

**Faseamento (decidido):**

- **Fase 1 (este ADR):** CRM → JumpFlow. No `CLOSED_WON` (e em ajustes da
  proposta ganha) o CRM envia o pacote da proposta para criar/atualizar o
  projeto. É o escopo ativo.
- **Fase 2 (adiada):** JumpFlow → CRM. Retorno de custo/margem/indicadores por
  projeto. Preservada no Apêndice A do `contrato-v1.md`, **não faz parte da v1**.

## Decisões

### D1 — Endpoint de ingestão fora de `/app/*`, com guarda M2M própria

`POST /integrations/crm/projects` fica **fora** de `/app/*`. A `proxy.ts` protege
apenas `/app/*` com sessão de usuário (Entra ID), então o endpoint usa guarda
própria: o JumpFlow atua como **resource server** validando OAuth 2.0
client-credentials (Entra ID) / Bearer no `Authorization`, separado do JWT de
usuário. **Por quê:** o chamador é máquina (CRM), não pessoa; reusar o gate de
usuário seria incorreto e acoplaria a ingestão à sessão de navegador.

### D2 — Idempotência reusando `IntegrationEvent`

A ingestão é registrada em `IntegrationEvent`, deduplicada por
`@@unique(provider, idempotencyKey)`, com novo `IntegrationProviderKind =
CRM_JUMPLABEL`. Reenvio do mesmo `idempotencyKey` ⇒ `DUPLICATE` sem efeito
colateral; `revision` ≤ a já aplicada é ignorada. **Por quê:** o outbox e a
idempotência já existem no JumpFlow; basta o novo provider — evita infraestrutura
paralela e garante entrega exatamente-uma-vez por chave.

### D3 — Âncora de correlação = `commercialContractRef`

A correlação estável é `commercialContractRef` (= `crmProposalReferenceId`,
já em `Project.commercialContractRef`, ADR 0002). Projeto já existente com esse
ref — inclusive criado à mão — é **vinculado e atualizado** (`LINKED_EXISTING`),
nunca recriado (gap G2). **Por quê:** projetos nascem à mão hoje; upsert por
referência do CRM sem âncora duplicaria; o campo já modela o vínculo comercial.

### D4 — G1 Opção A: `ProjectPlannedProfile` (perfil planejado sem pessoa)

Nova entidade fina `ProjectPlannedProfile` (projeto + `roleName` + `seniority` +
`quantity` + horas + valor de venda, sem pessoa), materializada em `Allocation`
só quando alguém for de fato alocado. **Por quê:** `Allocation` exige
`consultantId` e `Project.budgetHours` é total único — não há alvo para
"perfil + horas + valor sem pessoa". Descartar o detalhe (Opção B) é irreversível
e mataria o burn-down por perfil da Fase 2; o custo da Opção A é 1 model + 1
migration triviais.

### D5 — De/para dos campos do payload

- **Senioridade → `enum Seniority`** (`INTERN|JUNIOR|MID_LEVEL|SENIOR|SPECIALIST|PRINCIPAL`)
  por mapa explícito string→enum. **Por quê:** é o único de/para de perfil com
  alvo tipado no schema.
- **Cargo → texto livre** em `ProjectPlannedProfile.roleName`; `jobRoleSlug` vira
  rótulo de origem opcional. **Por quê:** não existe catálogo `JobRole` no
  JumpFlow — sem alvo para mapear.
- **Faturamento → `Project.billingTypeId`** resolvido pelo nome do catálogo
  `BillingType` (que é `@unique`); `OTHER` ⇒ `null` + `warning`. **Por quê:** o
  faturamento do projeto é FK a um catálogo com comportamento (`chargeType`), não
  um enum; o de/para é responsabilidade do JumpFlow, sem acoplar por nome no CRM.
- **Cliente → match por CNPJ normalizado (14 dígitos), app-level.**
  `Client.document` **não** é `@unique`; sem match ⇒ **cria** cliente + `warning`.
  **Por quê:** o banco não garante unicidade; rejeitar bloquearia o projeto
  inteiro por cadastro faltante.
- **Executivo → e-mail corporativo.** `Project.managerUserId` é referência solta
  (String, sem FK); sem match ⇒ grava a ref + `warning`, não bloqueia. **Por quê:**
  o vínculo de gestor não deve impedir a ingestão do projeto.

### D6 — `opportunityType`: todos os tipos criam `Project`

Todo `opportunityType` cria `Project` (preserva o vínculo comercial e a âncora
`commercialContractRef`). `timesheetMode` controla **apenas** se os perfis são
materializados em estrutura de horas. Evitar `IGNORED` — perderia rastreabilidade.
**Por quê:** a decisão de quais tipos ganham timesheet é de negócio (ver abaixo);
tecnicamente o projeto sempre pode existir sem alocações.

### D7 — Reversão pós-ganho: nunca deletar

`project.cancelled` ⇒ `ProjectStatus.CANCELLED` (novo estado no enum, hoje só
`PROPOSAL|ACTIVE|PAUSED|CLOSED`) + `AuditEvent`. **Nunca deletar** o projeto.
**Por quê:** pode já haver `TimeEntry` lançado; deletar corromperia execução e
receita. (A regra sobre o que fazer quando há horas lançadas está em aberto — ver
abaixo.)

## Invariante de segurança (fronteira D9)

**Nada de custo, remuneração ou margem — por pessoa ou por perfil — sai nesta
fase.** A Fase 1 é **só ingestão** (CRM → JumpFlow). O retorno de indicadores
agregados de projeto (custo total, margem, consumo) pertence à Fase 2 e respeita
a fronteira D9 do contrato: decomposição por perfil só pode existir em **horas**,
jamais em dinheiro; custo-hora, `ConsultantAllocationCostRate` e remuneração
nunca cruzam. Registrado aqui como invariante para que a implementação da Fase 1
não introduza nenhum caminho de saída de dado sensível.

## Decisões de negócio em aberto

Dependem de decisão humana e **não** são resolvidas por este ADR:

1. **Corte de `opportunityType` com/sem timesheet:** quais tipos
   (`LICENSING`/`BPO`/`SUPPORT`/`OTHER`) criam projeto **com** estrutura de horas
   e quais criam **sem**. Tecnicamente todos criam `Project`; o corte de negócio
   define o `timesheetMode` por tipo (§2.2 do contrato).
2. **Reversão com horas lançadas:** quando `project.cancelled` chega e já existe
   `TimeEntry` no projeto, a reversão **bloqueia** ou apenas marca `CANCELLED`?
   Em ambos os casos, nunca deleta.
3. **Mapa de senioridade string→enum:** preenchimento final do de/para entre
   `Seniority.name` do CRM e o `enum Seniority` do JumpFlow (o exemplo do contrato
   já casa `SENIOR`/`SPECIALIST`; os demais rótulos precisam ser confirmados em
   sessão conjunta).

## Consequências

- **Positivas:** ingestão idempotente reusando infraestrutura existente
  (`IntegrationEvent`); vínculo anti-duplicação por `commercialContractRef`;
  detalhe por perfil preservado (habilita Fase 2) sem materializar alocação falsa;
  degradação suave por `warning` em vez de bloqueio; nenhum dado sensível trafega.
- **Negativas / dívidas:** 3 mudanças de schema pendentes (novo estado
  `ProjectStatus.CANCELLED`, `IntegrationProviderKind.CRM_JUMPLABEL`, model
  `ProjectPlannedProfile`) com suas migrations; de-duplicação de cliente é
  app-level (o banco não garante unicidade de CNPJ); `managerUserId` como
  referência solta pode ficar sem User correspondente até revisão manual; as três
  decisões de negócio acima seguem como pendências de produto até a sessão
  conjunta.
