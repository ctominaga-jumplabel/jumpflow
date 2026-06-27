# Nathal.IA — Intelligence Architecture (Fase 8)

> Como a Nathal.IA deixa de ser personagem visual e passa a ser **assistente
> operacional local** do JumpFlow — **sem LLM**, sem ações de escrita, sem
> automações perigosas. Toda inteligência é determinística, baseada em regras e
> conteúdo curado.
>
> Última atualização: **2026-06-17** (Fase 8 — Intelligence Layer).

## Princípios

1. **Local-first, sem LLM.** Todas as respostas vêm de conteúdo curado (FAQ +
   base de conhecimento) e regras determinísticas. Nenhuma chamada a OpenAI,
   Anthropic ou qualquer provedor. A arquitetura deixa um *seam* claro para
   plugar um LLM depois (`KnowledgeProvider`, `IntentEngine`), mas nada hoje
   depende disso.
2. **Sem ações perigosas.** O `ToolRegistry` só expõe navegação, destaque de
   elemento e tours. Nenhuma escrita, nenhuma aprovação, nenhum dado sensível.
3. **Consentimento explícito.** Qualquer ação marcada como `sensitive` é
   bloqueada nesta fase e, quando habilitada, **exige confirmação** via
   `canExecuteAction` (já existente em `nathaliaPermissions.ts`).
4. **RBAC primeiro.** A Nathal nunca responde sobre tópicos que o perfil do
   usuário não pode acessar (financeiro, aprovações, administração). Ver
   [`INTELLIGENCE_SECURITY.md`](./INTELLIGENCE_SECURITY.md).
5. **SSR-safe e três-free.** O cérebro (`intelligence/`) é puro: sem React, sem
   `window`, sem `three`. Pode ser importado no servidor, em testes e no cliente.
   Os componentes React apenas o consomem.

## Camadas

```
                       ┌──────────────────────────────┐
   pergunta do usuário  │        NathaliaBrain         │  (orquestrador puro)
        ───────────────▶│  ask(question, {context,user})│
                       └──────────────┬───────────────┘
                                      │
        ┌──────────────┬──────────────┼───────────────┬──────────────┐
        ▼              ▼              ▼               ▼              ▼
  ┌───────────┐  ┌───────────┐  ┌───────────┐   ┌───────────┐  ┌───────────┐
  │  Intent   │  │   FAQ     │  │ Knowledge │   │   Tool    │  │  Visual   │
  │  Engine   │  │  Engine   │  │  Layer    │   │ Registry  │  │ Intel.    │
  │ (regras)  │  │ (curado)  │  │ (busca)   │   │ (mock)    │  │ (estado)  │
  └───────────┘  └───────────┘  └───────────┘   └───────────┘  └───────────┘
        │              │              │               │              │
        └──────────────┴──────────────┴───────────────┴──────────────┘
                                      │
                              BrainResponse { answer, visualState,
                                 accessory, clip, tool?, source, intent }
```

### 1. Knowledge Layer (`intelligence/knowledge/`)

- **`KnowledgeDocument`** — unidade de conhecimento (id, título, corpo, tags,
  contexto, `roles?` para RBAC, `source`).
- **`KnowledgeRegistry`** — coleção registrável de documentos (add/get/list/
  byContext). Vem semeada com `documents.ts` (extraído de docs/FAQ/textos da
  aplicação das fases anteriores).
- **`KnowledgeProvider`** — interface (`search`, `get`). A implementação padrão é
  `LocalKnowledgeProvider` (busca por palavras-chave, sem LLM). É **o seam** para
  um provider com embeddings/LLM no futuro.
- **`KnowledgeSearch`** — busca por pontuação (tokenização pt-BR leve, peso por
  título/tags/corpo, filtro por contexto e RBAC). Determinística.

### 2. Context Layer (`intelligence/context/`)

- **Context Awareness V2** (`contextAwareness.ts`) — expande o Context Engine:
  além de mapear rota→contexto, gera **mensagens específicas** por tela
  ("Posso ajudar a lançar, revisar ou enviar suas horas.") e expõe as
  capacidades/perguntas sugeridas daquele contexto.

### 3. Tool Layer (`intelligence/tools/`)

- **`ToolRegistry`** — catálogo de ferramentas **mockadas** (navegação, destaque,
  tour). Cada tool declara `sensitivity` e `requiresConfirmation`. Nada de
  escrita. Resolução e execução passam pelo RBAC existente.

### 4. Visual Intelligence Layer (`intelligence/visual/`)

- **`visualIntelligence.ts`** — conecta a **resposta/intenção** ao **estado
  visual**: estado emocional → acessório → clipe de animação. Ex.: pergunta
  "Como lançar horas?" → `explaining` → `clipboard` → clipe `Explaining`.

### 5. Proactive Layer (`intelligence/proactive/`)

- **`ProactiveEngine`** — sugere nudges **seguros e raros**: primeira visita,
  primeiro acesso a uma tela, usuário aparentemente perdido, tour disponível.
  Nunca interrompe de forma agressiva; o host decide se exibe.

### Orquestrador (`intelligence/brain/NathaliaBrain.ts`)

`ask(question, { context, user })` →
1. `IntentEngine.detect` classifica (navegar / explicar / ensinar / tour /
   dúvida / saudação / desconhecido).
2. Se navegação/tour → propõe a tool correspondente (sujeita a RBAC).
3. Senão → `FAQEngine.answer` (curado, filtrado por RBAC); se vazio →
   `KnowledgeProvider.search`; se vazio → fallback honesto.
4. `visualIntelligence` deriva estado/acessório/clipe a partir da intenção e do
   contexto.
5. Retorna `BrainResponse` — o Provider apenas o aplica à store/UI.

## Fluxo no app

```
usuário digita ──▶ NathaliaProvider.sendMessage(text)
                      │
                      ▼
              NathaliaBrain.ask(text, { context, user })
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  sayNathalia(answer,         setNathaliaState(visualState)
   "nathalia", visualState)   (acessório/clipe via visualStateForContext + brain)
        │
        ▼
  tool opcional (navegação/tour) — só após RBAC, sem escrita
```

## Segurança & RBAC (resumo)

- Tópicos sensíveis (`finance`, `approvals`, `settings`) só são respondidos se o
  perfil permitir (`canAskAboutFinance`, `canAskAboutApprovals`,
  `canAccessContext`). Documentos/FAQ carregam `roles?` e são filtrados na busca.
- Nenhuma resposta expõe **valores** financeiros reais — apenas conceitos.
- Nenhuma tool executa escrita; sensíveis ficam bloqueadas e exigiriam
  confirmação. Detalhes e ameaças em [`INTELLIGENCE_SECURITY.md`](./INTELLIGENCE_SECURITY.md).

## Não-objetivos desta fase

- Nenhum LLM/embeddings/streaming.
- Nenhuma persistência de memória de conversa entre sessões.
- Nenhuma ação de escrita ou aprovação automática.
- Nenhum acesso a dados reais do usuário (apenas conteúdo curado e mocks).

## Guias relacionados

- [`KNOWLEDGE_BASE.md`](./KNOWLEDGE_BASE.md) — conteúdo da base local.
- [`INTELLIGENCE_GUIDE.md`](./INTELLIGENCE_GUIDE.md) — como o cérebro funciona e como estender.
- [`FAQ_GUIDE.md`](./FAQ_GUIDE.md) — como escrever/curar FAQs.
- [`TOOLING_GUIDE.md`](./TOOLING_GUIDE.md) — como adicionar tools com segurança.
- [`PROACTIVE_GUIDE.md`](./PROACTIVE_GUIDE.md) — eventos proativos seguros.
- [`INTELLIGENCE_SECURITY.md`](./INTELLIGENCE_SECURITY.md) — RBAC e modelo de ameaças.
</invoke>
