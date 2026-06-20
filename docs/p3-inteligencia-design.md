# P3 — Inteligência (Talentos): design de infraestrutura de IA

> Status: design arquitetural (jump-architect). Cobre a **infraestrutura** das três
> features da Prioridade 3 do roadmap de Talentos — **IA de Alocação (8.2)**,
> **IA de Risco de Projeto (8.3)** e **Score do Consultor (8.4)** — sem implementar
> a lógica de negócio das features. Fonte: `docs/roadmap-talentos-gcpec.md` (§8 e §10).
> Alinhado a `docs/arquitetura.md` e ao padrão de provider/flags já existente no projeto.

## 0. Princípio diretor (vem direto da §10 do roadmap)

Dois cuidados da §10 governam tudo abaixo:

1. **"Não materializar score/risco cedo: calcular sob demanda."** → Nenhuma tabela de
   snapshot nesta fase. Tudo é **read-model computado a partir de dados existentes**.
2. **"IA sempre como sugestão com revisão humana."** → O **núcleo** das três features é
   **determinístico** (heurístico, puro, testável, transparente). O **LLM é apenas
   enriquecimento opcional atrás de flag** e nunca produz o número/ranking/nível — só
   produz texto sobre eles.

Consequência arquitetural central: **o LLM nunca está no caminho crítico**. Se a flag está
off, sem credencial ou a chamada falha, a feature continua funcionando 100% com a saída
determinística; some apenas a prosa.

---

## 1. Fronteira determinístico × LLM

A regra é a mesma do `SkillSuggestion` já existente (governança do
`jump-skills-intelligence-agent`): a máquina sugere, o humano decide.

### 1.1 IA de Alocação (8.2)

**Determinístico (núcleo, sempre ativo, sem flag):** função pura que recebe rows do Prisma e
devolve um ranking de candidatos a uma alocação, com **fatores explícitos e pesos visíveis**:

- **Aderência de skills** — `ConsultantSkill.level` (apenas `validationStatus = VALIDATED`)
  × `AllocationSkill` (nível requerido por alocação). Gap por skill exigida.
- **Disponibilidade** — reusar `lib/availability` (`buildAvailabilityMap` / `classifyCell`):
  `Allocation.allocationPercent` + `ConsultantTimeOff` + status. Penaliza FULL/VACATION/ON_LEAVE.
- **Histórico com o cliente** — alocações anteriores do consultor no mesmo `clientId`.
- **Fator financeiro (condicional a RBAC, ver §5)** — encaixe de `ConsultantAllocationCostRate`
  no `ProjectSaleRate`/budget (margem). Só entra na composição para `FINANCIAL_ROLES`.

Saída determinística: lista ordenada `{ consultantId, score, factors }` (ex.: "João — 92%
aderência"), onde `factors` é a decomposição transparente.

**LLM (enriquecimento, atrás de `NEXT_PUBLIC_AI_ALLOCATION`):** dado o `{ score, factors }` já
calculado, gerar uma **explicação em linguagem natural** da sugestão
("João é a melhor escolha porque tem React validado em nível avançado e está 50% livre nas
próximas 3 semanas"). O LLM **não reordena nem recalcula** — recebe os fatores prontos e os
verbaliza. Retorna `null` → a UI mostra só os fatores estruturados.

### 1.2 IA de Risco de Projeto (8.3)

**Determinístico (núcleo, sempre ativo):** função pura que computa nível
`GREEN | YELLOW | RED` + `signals` a partir de:

- **Burn rate** — `Project.budgetHours` vs soma de `TimeEntry` (horas consumidas vs planejadas
  vs % de prazo decorrido).
- **Atrasos / desvio de prazo** — datas de alocação/projeto vs progresso.
- **Margem** — custo vs valor (condicional a RBAC, §5; para não-financeiros o sinal de margem
  não entra).
- **Sinais de pessoas** — quantidade/recência de `Feedback` do tipo `CONCERN`, gap de skills da
  equipe alocada.

Saída determinística: `{ level, score, signals }` com cada sinal nomeado e seu valor.

**LLM (enriquecimento, atrás de `NEXT_PUBLIC_AI_RISK_SENTIMENT`):** **análise de sentimento**
dos textos livres de `Feedback`/comentários do projeto, devolvendo um rótulo agregado
(ex.: "tom predominantemente negativo nos últimos feedbacks") que entra como **um sinal a mais
exibido**, claramente marcado como "gerado por IA". Decisão de governança: o sentimento do LLM
**não altera o nível determinístico** nesta fase — é exibido ao lado, para o humano ponderar.
Se quisermos no futuro que ele componha o score, isso será uma decisão explícita e auditada.
Retorna `null` → o risco é o determinístico puro, sem o sinal de sentimento.

### 1.3 Score do Consultor (8.4)

**Determinístico (núcleo, sempre ativo):** função pura que computa `score 0–100` + `breakdown`
combinando dados existentes:

- **Avaliações** — médias de `Evaluation*` (radar) por competência.
- **Horas/presença** — consistência de `TimeEntry` (apontamento em dia, sem buracos).
- **Certificações** — `Certificate` válidos (e penalidade por vencidos).
- **Capacitação** — `Enrollment` concluídos.
- **Feedbacks** — saldo `PRAISE/RECOGNITION` vs `CONCERN`.
- **Fator financeiro (condicional, §5)** — realização vs custo. Só para `FINANCIAL_ROLES`.

Saída determinística: `{ score, breakdown }` onde `breakdown` é a **composição transparente**
(cada fator, seu peso e sua contribuição).

**LLM (enriquecimento, atrás de `NEXT_PUBLIC_AI_SCORE_NARRATIVE`):** **narrativa** do score
("score 78 — forte em entrega e certificações; oportunidade de evolução em soft skills") a
partir do `breakdown` já calculado. Não recalcula o número. Retorna `null` → mostra só o
breakdown numérico.

### 1.4 Resumo da fronteira

| Feature | Determinístico (núcleo, sem flag) | LLM (enriquecimento, atrás de flag) |
|---|---|---|
| Alocação (8.2) | ranking por aderência skill×alocação, disponibilidade, histórico cliente, [margem] | explicação textual da sugestão |
| Risco (8.3) | nível GREEN/YELLOW/RED por burn rate, atraso, [margem], feedbacks CONCERN | sentimento dos comentários (sinal exibido à parte) |
| Score (8.4) | score 0–100 por avaliação, horas, certificações, capacitação, feedback, [margem] | narrativa do score |

`[margem]` = fator financeiro, só presente para `FINANCIAL_ROLES` (§5).

---

## 2. Abstração de provider de IA (`lib/ai`)

Segue o mesmo padrão de `lib/cnpj`, `lib/bank`, `lib/nfse`: **interface + provider
disabled/noop + factory como ponto de injeção**, com degradação graciosa (retorna `null`,
nunca lança). Esqueleto criado neste design (mínimo, sem chamada real):

- `apps/web/src/lib/ai/provider.ts`
- `apps/web/src/lib/ai/flags.ts`
- `apps/web/src/lib/ai/log.ts`

### 2.1 Interface

```ts
export interface AiTextProvider {
  // Retorna texto gerado, ou null quando desabilitado/sem credencial/falha.
  complete(prompt: string, opts?: AiCompleteOptions): Promise<string | null>;
}
```

`AiCompleteOptions` carrega `model`, `maxTokens`, `system` e `entityType`/`entityId` (correlação
para auditoria). Um único método `complete` cobre os três casos de uso (todos são texto curto:
explicação, sentimento, narrativa) — sem inflar a interface prematuramente.

### 2.2 Provider default (noop)

`DisabledAiTextProvider.complete()` → `null` sempre. É o retorno de `getAiTextProvider()`
enquanto não houver provider real. Isso torna o caminho de enriquecimento **safe-by-default** e
alinhado a "IA sempre como sugestão": sem provider, não há narrativa, e o engine determinístico
roda intacto.

### 2.3 Plugar um provider real (Claude) depois

Sem implementar agora. O ponto de injeção é a factory `getAiTextProvider()`:

```ts
// futuro:
if (isAiProviderConfigured() && process.env.AI_PROVIDER === "anthropic") {
  return new AnthropicAiTextProvider();
}
```

`isAiProviderConfigured()` exige `AI_PROVIDER` + `ANTHROPIC_API_KEY`. Modelos atuais expostos em
`AI_MODELS` para o provider real escolher por custo/latência por call site:

- `claude-opus-4-8` (Opus 4.8) — maior qualidade/custo; reservar para casos difíceis.
- `claude-sonnet-4-6` (Sonnet 4.6) — default equilibrado para narrativas.
- `claude-haiku-4-5-20251001` (Haiku 4.5) — mais barato/rápido; ideal para sentimento e rótulos curtos.

### 2.4 Registro de uso (IntegrationEvent)

`lib/ai/log.ts` expõe `recordAiUsage()` como **seam único** de auditoria. Decisão:
o enum `IntegrationProviderKind` hoje tem `CNPJ, CEP, ENTRA_ID, SAO_PAULO_NFSE, EMAIL, STORAGE,
BANK, ERP` — **não tem `AI`**. Recomendação: **não adicionar `AI` ao enum nesta fase de design**
(coerente com §4 — sem novo schema agora). Quando o **primeiro provider real** for implementado,
adicionar `AI` ao enum numa migration pequena e dedicada e ativar `recordAiUsage()` para criar um
`IntegrationEvent` (`provider="AI"`, `operation=feature`, `status`, `entityType/entityId`,
`error`). Até lá, `recordAiUsage()` é um no-op tipado, mantendo o contrato de auditoria
referenciável pelo código de domínio sem mudar o banco.

---

## 3. Feature flags propostas (estilo `lib/feedback/flags.ts`, todas OFF por padrão)

Em `apps/web/src/lib/ai/flags.ts`, edge-safe, `NEXT_PUBLIC_*`:

| Flag | Feature | Liga |
|---|---|---|
| `NEXT_PUBLIC_AI_ALLOCATION` | 8.2 | explicação em linguagem natural da sugestão de alocação |
| `NEXT_PUBLIC_AI_RISK_SENTIMENT` | 8.3 | análise de sentimento de comentários para o risco |
| `NEXT_PUBLIC_AI_SCORE_NARRATIVE` | 8.4 | narrativa do score do consultor |

Helpers: `isAiAllocationEnabled()`, `isAiRiskSentimentEnabled()`, `isAiScoreNarrativeEnabled()`,
`getAiFlags()`. **As flags só governam o enriquecimento LLM** — o núcleo determinístico das três
features roda independentemente delas. Mesmo com flag on, sem provider configurado a chamada
retorna `null` e a UI degrada.

---

## 4. Sem novo schema (decisão)

**Decisão: NÃO criar tabelas de snapshot (`AllocationSuggestion`, `ProjectRiskSnapshot`,
`ConsultantScoreSnapshot`) nesta fase.** Tudo é computado **sob demanda** como read-model a partir
do que já existe, exatamente como o Mapa de Disponibilidade (8.1) já faz em `lib/availability`
("derived from existing data … no new schema").

Motivação (alinhada à §10 "não inflar o schema cedo"):

- Score/risco/sugestão são **derivados** de dados que já mudam (horas, alocações, feedbacks,
  avaliações). Materializar cedo cria **dados duplicados que envelhecem** e exigem jobs de
  recálculo, invalidação e backfill — complexidade prematura.
- A qualidade dos engines ainda vai iterar (pesos, fatores). Mudar a fórmula com snapshots já
  gravados gera inconsistência histórica e migração de dados — caro e arriscado nesta fase.
- Read-model puro é **testável e transparente** (entra row, sai score+fatores), o que sustenta o
  requisito de governança (§6).

Quando reconsiderar (gatilhos explícitos, não agora): (a) necessidade de **histórico/tendência**
("evolução do score ao longo dos ciclos", "risco do projeto na semana passada"); (b) **custo de
cálculo** sob demanda virar gargalo em telas de lista; (c) querer **congelar** a sugestão que
embasou uma decisão para auditoria. Mesmo então, preferir materializar **apenas o caso de uso que
exige** (provavelmente histórico do score), não os três por simetria. O roadmap §8.2/8.3/8.4 cita
esses modelos como possibilidade futura — este design os adia conscientemente.

Os snapshots LLM tampouco são persistidos: a prosa é gerada na hora e descartada; o que se grava
é apenas o `IntegrationEvent` de uso (§2.4), não o conteúdo.

---

## 5. RBAC / financeiro

`FINANCIAL_ROLES = [ADMIN, AREA_MANAGER, FINANCE]` (de `lib/auth/route-permissions.ts`). Os
engines leem custo/valor hora (`ConsultantAllocationCostRate`, `ProjectSaleRate`), que são campos
financeiros protegidos por papel.

Regra: **o fator financeiro só existe na composição quando o requisitante é `FINANCIAL_ROLES`.**
Para os demais papéis, o **mesmo engine roda sem o fator financeiro** — não é mascarar a saída, é
não computar nem buscar o dado. A decisão de incluir/excluir o fator é resolvida **no servidor**,
passada como flag de entrada para a função pura (que permanece sem I/O e sem conhecer RBAC).

| Feature | Quem vê | Fator financeiro |
|---|---|---|
| **Alocação (8.2)** | `PEOPLE`, `AREA_MANAGER`, `PROJECT_MANAGER` (do seu projeto), `ADMIN` | margem/custo só para `FINANCIAL_ROLES`; demais recebem ranking só por skill/disponibilidade/histórico |
| **Risco (8.3)** | `PROJECT_MANAGER` (seu projeto), `AREA_MANAGER`, `ADMIN` (e `FINANCE` na ótica de margem) | sinal de margem só para `FINANCIAL_ROLES`; demais veem risco por burn rate/prazo/feedback |
| **Score (8.4)** | `PEOPLE` e `ADMIN` (todos); `AREA_MANAGER`/`PROJECT_MANAGER` (seu time); `CONSULTANT` (o próprio) | fator de realização/custo só para `FINANCIAL_ROLES`; consultor vê o próprio score sem o componente financeiro |

Privacidade (§4 do roadmap): score e feedbacks são dados sensíveis. Consultor vê o próprio
histórico, gestor vê o do time, RH vê tudo. Scoping (quais consultores/projetos) é responsabilidade
do servidor antes de chamar a função pura — espelha o contrato já adotado em `buildAvailabilityMap`.

---

## 6. Transparência / governança

- **Composição sempre exposta.** Score, risco e sugestão devolvem `breakdown`/`signals`/`factors`
  estruturados; a UI mostra **como o número foi formado** (fator, peso, contribuição). Nada de
  caixa-preta — é a mesma transparência exigida no roadmap §8.4 ("mostra a composição").
- **IA é sugestão, decisão é humana.** O ranking de alocação não aloca; o nível de risco não muda
  status; o score não toma ação. Tudo segue a filosofia `SkillSuggestion` (PENDING → revisão).
- **LLM nunca decide o número.** O enriquecimento recebe os fatores já calculados e só gera texto.
  O texto gerado por IA é **rotulado como tal** na UI.
- **Log de uso de LLM.** Toda chamada real registra `IntegrationEvent` via `recordAiUsage()`
  (§2.4): qual feature, qual modelo, qual entidade, sucesso/falha. Auditável (§4 do roadmap exige
  auditar mudança de score; aqui auditamos também o uso de IA).
- **Degradação graciosa.** Flag off / sem credencial / falha → `null`, e a feature entrega a saída
  determinística. O usuário nunca fica sem resposta por causa da IA.

---

## 7. Arquivos deste design

- Doc: `docs/p3-inteligencia-design.md` (este arquivo).
- Esqueleto (mínimo, sem lógica de negócio):
  - `apps/web/src/lib/ai/flags.ts` — 3 flags OFF por padrão + `getAiFlags()`.
  - `apps/web/src/lib/ai/provider.ts` — `AiTextProvider`, `DisabledAiTextProvider`,
    `getAiTextProvider()` (ponto de injeção), `AI_MODELS`, `isAiProviderConfigured()`.
  - `apps/web/src/lib/ai/log.ts` — `recordAiUsage()` (seam de auditoria, no-op até existir
    provider real + valor `AI` no enum).

Não implementado de propósito (escopo das features, não desta infra): as funções puras de
ranking/risco/score, as queries Prisma de leitura, o provider Anthropic real e a migration que
adiciona `AI` ao `IntegrationProviderKind`.
