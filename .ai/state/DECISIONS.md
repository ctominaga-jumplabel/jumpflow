# DECISIONS (append-only)

> Formato: `[data] decisao - motivo - alternativas descartadas`.
> Nunca reescreva uma decisao; marque como SUPERADA e adicione a nova abaixo.

- [2026-06-15] Adotar AIOS (camada de constituicao + estado em `.ai/`) sobre o
  projeto - motivo: retomada a frio, troca de modelo e economia de contexto -
  alternativas: manter so docs/ soltos (rejeitado: sem hierarquia de verdade).

- [2026-06-15] AIOS coordena, agentes `jump-*` executam - motivo: ja existem 23
  agentes de dominio maduros em `.claude/agents/` - alternativa: recriar agentes
  genericos no `.ai/agents/` (rejeitado: duplicacao e drift).

- [2026-06-15] Sequencia de fases A->H com NFS-e por ultimo - motivo: NFS-e SP e
  o maior risco (dependencia externa + certificado) - alternativa: NFS-e cedo
  (rejeitado: bloquearia entregas de menor risco).

- [2026-06-15] Antes de implementar, confirmar no schema Prisma - motivo: schema
  esta a frente da UI; muitas lacunas sao so UI+Action - alternativa: assumir
  ausencia (rejeitado: gera retrabalho e modelagem duplicada).

- [2026-06-15] (Fase A) Editar lancamento SUBMITTED reabre via re-submissao
  (status->SUBMITTED + submittedAt renovado) e audita `before.status` - motivo:
  reaproveita o fluxo existente de re-submit e mantem rastreabilidade - alternativa:
  novo status REOPENED (rejeitado: muda enum e fila sem ganho real). APPROVED/CLOSED
  seguem bloqueados.

- [2026-06-15] (Fase A) Preview de anexo decide render por `contentType`
  (img/pdf/fallback) e usa `previewExpenseId` para isolar o anexo - motivo:
  corrige bug do preview preso ao 1o anexo e evita iframe em tipo nao visualizavel.

- [2026-06-15] (Fase B) Reabertura/decisao em massa estende `decideHours` (tabela
  `DECIDE_HOURS_SOURCE_STATUS`) em vez de action nova - motivo: RBAC/audit/idemp.
  identicos para qualquer transicao. CLOSED terminal. Reabertura grava Approval
  manual (isAutomatic:false) + AuditEvent `TIME_ENTRY_REOPENED`.

- [2026-06-15] (Fase B) Motor pula entries com Approval manual previo via
  `withManualDecisionHistory` (razao `MANUAL_DECISION_HISTORY`) - motivo: nao
  reverter decisao humana; mantem idempotencia e observabilidade.

- [2026-06-15] (PROCESSO) NUNCA rodar em paralelo agentes que tocam git
  (stash/checkout) - motivo: um agente fez `git stash` enquanto o outro editava e
  o `pop` conflitou (recuperado sem perda) - regra: agentes paralelos so editam
  arquivos disjuntos e NAO usam git; orquestrador cuida do git.

- [2026-06-15] (Fase C) Enum BillingChargeType preserva os 4 valores antigos e
  adiciona 12 - motivo: nao quebrar dados nem CONSULTANT_HOURLY (base de NF) -
  alternativa: renomear (rejeitado: migracao destrutiva). 16 valores totais.

- [2026-06-15] (Fase C) Logo guarda storage key em `logoUrl` + URL assinada na
  exibicao (sem migration) - motivo: Client so tem `logoUrl`; evita acoplar a
  outra migration - melhoria futura: colunas logoBucket/logoStorageKey dedicadas.

- [2026-06-15] (Fase C) Bug de foco do CNPJ era do Modal (efeito dependia de
  `onClose` inline) - corrigido com `onCloseRef` + deps `[open]`; conserta todos
  os modais. SUPERA a hipotese inicial de bug no campo CNPJ.

- [2026-06-15] (Fase D) Ligar valor de venda a NF por hora **ja estava feito**
  (`generateRevenueClosings`/`resolveSaleRate` com escopo allocation/consultant/
  project + fallback) - Fase D reduz ao modelo `AllocationSkill`.

- [2026-06-15] (Fase E) Encargos CLT sao DERIVADOS (modulo puro `clt-charges.ts`
  + tabelas 2026 parametrizadas), injetados em `computeCompensation` via
  `cltCharges`, NAO persistidos em discountRules - motivo: faixas mudam por ano;
  persistir deixaria valor velho no banco. discountRules fica para descontos
  manuais. FGTS informativo (custo patronal, nao desconta do liquido).

- [2026-06-15] (Fase G) `Client` nao tinha e-mail; "e-mail ao cliente" exige
  campo - decisao: adicionar `Client.contactEmail` (nullable, migration aditiva).
  Pre-fatura = artefato interno gerado de RevenueClosing+lines (sem dep de PDF
  pesada); e-mail idempotente. NFS-e real fica para Fase H.

- [2026-06-15] (Fase G) Pre-fatura e artefato interno marcado "Nao constitui
  documento fiscal"; ISS e ESTIMADO (issRate%). ISS definitivo e do provider NFS-e
  (Fase H). E-mail idempotente via AutomationEmailLog (type PRE_INVOICE).

- [2026-06-15] (Fase H) NFS-e real atras de `isNfseConfigured()`; sem credenciais
  retorna DisabledNfseProvider - motivo: nunca fingir emissao fiscal; preservar
  fluxo manual atual. Material do certificado so transita pelo `NfseSigner`
  plugavel (nunca logado/persistido). XML builder/parser puros e testados offline;
  rede e cert ficam fora dos testes.
