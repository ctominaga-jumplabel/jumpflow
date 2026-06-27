# Nathal.IA — Intelligence Guide (Fase 8)

> Como o cérebro local funciona e como estendê-lo. Código em
> `packages/character-nathalia/src/intelligence/`. **Sem LLM.**

## Visão geral

O `NathaliaBrain` orquestra cinco peças puras (sem React, sem `window`, sem
`three`):

```
detectIntent → (navegação/tour ⇒ ToolRegistry) | (FAQ ⇒ Knowledge ⇒ fallback)
            → visualForIntent → BrainResponse
```

Tudo é determinístico e SSR-safe. A camada React (`NathaliaProvider`,
`NathaliaChatPanel`) apenas aplica a `BrainResponse` à store.

## `NathaliaBrain.ask(request)`

```ts
import { defaultNathaliaBrain } from "@jumpflow/character-nathalia";

const res = defaultNathaliaBrain.ask({
  question: "Como lançar horas?",
  context: "hours",
  user: { id, name, roles: ["CONSULTANT"] },
});
// res: { answer, intent, visual: { state, accessory, clip }, source, tool?, relatedDocId?, followUps }
```

Ordem de resolução:

1. **greeting** → mensagem de Context Awareness + estado `welcome`.
2. **navigate / tour** → resolve uma tool no `ToolRegistry`, **checando RBAC**
   (`canAccessContext` + `canExecuteAction`). Bloqueado ⇒ `source: "blocked"`.
3. **FAQ** (`defaultFaqEngine.best`) — resposta curada de maior precisão.
4. **Knowledge** (`defaultKnowledgeProvider.search`) — conteúdo mais amplo.
5. **fallback** honesto (`nathaliaCopy.mockNotice`).

`source` indica de onde veio (`faq | knowledge | navigation | tour | greeting |
blocked | fallback`).

## Intent Engine

`detectIntent(text, { context })` → `{ kind, confidence, targetContext?, matched? }`.
Tipos: `greeting | navigate | tour | teach | explain | question | unknown`.
Regras por palavras-chave normalizadas (ver `IntentEngine.ts`). Para adicionar um
gatilho, edite os arrays `*_TRIGGERS`; para reconhecer uma tela, edite
`CONTEXT_KEYWORDS`.

## Injeção de dependências

`new NathaliaBrain({ faqEngine, knowledge, toolRegistry })` aceita substituições
— útil para testes ou para um provider de conhecimento alternativo (o seam para
LLM). Sem argumentos, usa os padrões empacotados.

## Como estender

- **Nova FAQ** → [`FAQ_GUIDE.md`](./FAQ_GUIDE.md).
- **Novo documento** → [`KNOWLEDGE_BASE.md`](./KNOWLEDGE_BASE.md).
- **Nova tool** → [`TOOLING_GUIDE.md`](./TOOLING_GUIDE.md).
- **Novo nudge** → [`PROACTIVE_GUIDE.md`](./PROACTIVE_GUIDE.md).
- **Mensagem por tela** → `intelligence/context/contextAwareness.ts` (`awarenessSeeds`).
- **Composição visual** → `intelligence/visual/visualIntelligence.ts`.

## Teste manual

Use o **Nathal.IA Lab** em `/app/dev/nathalia` (apenas em desenvolvimento):
troque contexto/estado/acessório, simule perfis e exercite intents, respostas e
nudges. Ver Etapa 11 da Fase 8.
