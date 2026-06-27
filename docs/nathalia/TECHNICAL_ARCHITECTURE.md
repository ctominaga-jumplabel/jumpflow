# Nathal.IA — Arquitetura Técnica

## Decisão: 2D-only

A Nathal.IA é um **produto 2D animado**. A abordagem 3D (three.js / React Three
Fiber / Blender / GLBs) foi **descontinuada** e removida do runtime/build em
2026-06; os artefatos foram arquivados em
[`archive/nathalia-3d/`](../../archive/nathalia-3d/README.md). Nenhum código de
runtime importa `three`/`@react-three/*`.

Motivo: o avatar de expressões ilustradas entrega presença, emoção e lip-sync
com **muito menos peso** (sem WebGL, sem GLB, sem fallback frágil), melhor
acessibilidade e manutenção mais simples. A evolução para vetor interativo será
via **Rive** (ver [`ROADMAP.md`](./ROADMAP.md)), não 3D.

## Onde mora

Pacote isolado do monorepo: **`packages/character-nathalia`**
(`@jumpflow/character-nathalia`). Framework-agnóstico onde possível; só os
componentes são React. Desacoplado do `AppUser`/RBAC do host (recebe um
`NathaliaUser` simples). É transpilado pelo Next via `transpilePackages`.

```
packages/character-nathalia/src/
  index.ts                  # barrel público
  nathaliaTypes.ts          # contrato de tipos interno (rico)
  nathaliaSpecAliases.ts    # NathaliaMood/Viseme/Context + adapters (vocabulário do spec)
  nathaliaStore.ts          # store imperativo (useSyncExternalStore) — "emotion engine"
  nathaliaEngine.ts         # NathaliaStateEngine (fachada com forma do spec)
  NathaliaProvider.tsx      # contexto React + cálculo de nudges a partir de signals
  NathaliaRoot.tsx          # portal para document.body (camada z-[9999])
  NathaliaWidget.tsx        # launcher  (alias: NathaliaLauncher)
  NathaliaChatPanel.tsx     # painel    (alias: NathaliaPanel)
  NathaliaBubble.tsx        # balão contextual
  NathaliaAvatar.tsx        # face (sempre 2D)
  NathaliaAvatar2DExpr.tsx  # avatar de expressões ilustradas + lip-sync (padrão)
  NathaliaAvatar2D.tsx      # avatar SVG dependency-free (fallback via flag)
  NathaliaExpression.tsx    # uma expressão estática por chave
  NathaliaVisemePreview.tsx # um visema / ciclo de visemas (fala simulada)
  NathaliaAvatarRive.tsx    # avatar vetorial Rive (importa @rive-app/react-canvas)
  NathaliaAvatarRiveLazy.tsx# boundary lazy (mantém Rive fora do bundle inicial)
  nathaliaRive.ts           # contrato do .riv (artboard/SM/inputs/índices) + flag
  NathaliaConfetti.tsx, NathaliaTooltip.tsx, NathaliaTour.tsx, NathaliaContextCard.tsx
  nathaliaExpressions.ts    # catálogo de expressões/visemas + resolução
  nathaliaStates.ts         # estados visuais + acentos de cor por intenção
  nathaliaContext.ts        # contextos + mapeamento de rota (pt-BR)
  nathaliaCopy.ts, nathaliaWelcome.ts, nathaliaPanelLayout.ts, nathaliaFraming.ts
  nathaliaIdle.ts           # config de respiro/piscar (dados puros)
  nathaliaPermissions.ts    # RBAC (gate de contexto/ação/tópico)
  nathaliaSpeech.ts         # adapter de voz (TTS) — interface, sem provider real
  intelligence/             # cérebro local sem LLM (intent, faq, knowledge, tools, proactive, visual)
```

> Dados ainda exportados mas **legados** (sem `three`): `nathaliaAnimations`
> (metadados de clipe usados por `BrainResponse.visual.clip`), `nathaliaAccessories`,
> `nathaliaVisualStates`. Mantidos para não quebrar contratos; serão revisitados.

## Fluxo de dados

```
Servidor (layout /app)
  └─ calcula NathaliaSignals (horas, aprovações, atrasos) ─┐
                                                           ▼
NathaliaMount (ssr:false) → NathaliaApp
  └─ <NathaliaProvider user signals>
        ├─ ProactiveEngine.evaluateSignals(signals) → nudges
        └─ <NathaliaRoot> (portal → body, z-[9999])
              ├─ <NathaliaWidget/>  (launcher + bubble)
              └─ <NathaliaTour/>
```

A rota muda → `setNathaliaContext()` → store atualiza `context`/`state`/`message`
→ componentes reagem via `useNathalia()` / `useNathaliaSnapshot()`.

## A "emotion engine" (store) e a fachada

O coração é um store externo minúsculo (`nathaliaStore.ts`), com setters
imperativos chamáveis de qualquer lugar do cliente: `setNathaliaState`,
`setNathaliaContext`, `sayNathalia`, `celebrateNathalia`, `notifyNathalia`,
`startNathaliaSpeaking`, `resetNathalia`, etc. — expostos a React por
`useSyncExternalStore`.

Sobre ele, `NathaliaStateEngine` (`nathaliaEngine.ts`) oferece a **forma pedida
pelo spec** (aditiva, sem novo estado):

```ts
nathaliaEngine.setContext("hours");
nathaliaEngine.speak("Posso te ajudar a lançar horas."); // mood speaking + lip-sync
nathaliaEngine.celebrate("Tudo aprovado! 🎉");
nathaliaEngine.alert("Há aprovações pendentes.");
nathaliaEngine.setMood("thinking");
nathaliaEngine.reset();
// getters: .mood .context .message .queue .suggestedAction
```

## Contrato de tipos: interno (rico) + aliases do spec

O contrato **interno** é mais rico que o vocabulário público do spec; mantê-lo
evita churn e preserva expressividade. Os aliases do spec ficam em
`nathaliaSpecAliases.ts`, com adapters puros:

| Spec | Interno | Adapter |
| ---- | ------- | ------- |
| `NathaliaMood` (10) | `NathaliaStateKey` (12) | `moodToState` / `stateToMood` |
| `NathaliaViseme` (`A`..`S`) | `NathaliaVisemeKey` (`a`..`tdn`) | `specVisemeToKey` / `keyToSpecViseme` |
| `NathaliaContext` (6) | `NathaliaContextKey` (11) | `specContextToKey` / `keyToSpecContext` |

Mapeamentos-chave: `worried→warning`, `alert→pointing`, `celebrating→celebrate`,
`speaking→explaining` (+ flag `speaking`); `F→fv`, `tdn→L`; `home→dashboard`.

## Inteligência local (sem LLM)

`intelligence/` resolve perguntas e proatividade **sem rede**: `IntentEngine`
(intenção), `NathaliaFAQEngine` + `KnowledgeProvider` (respostas), `ToolRegistry`
(ações navegacionais seguras), `ProactiveEngine` (nudges a partir de signals),
`visualIntelligence`/`contextAwareness` (estado visual + capacidades por tela).
`NathaliaBrain.ask()` orquestra e devolve `BrainResponse { answer, source,
visual, followUps, tool? }`. O seam para um LLM real é o `KnowledgeProvider` /
um futuro provider de chat.

## Renderização do avatar

`NathaliaAvatar` é o ponto único de troca de renderer:
- **Padrão:** `NathaliaAvatar2DExpr` (arte ilustrada, crossfade entre expressões,
  glance sutil, lip-sync por visemas), ou `NathaliaAvatar2D` (SVG) quando
  `NEXT_PUBLIC_NATHALIA_2D_EXPR=false`.
- **Opt-in Rive:** com `NEXT_PUBLIC_NATHALIA_RIVE=true`, usa
  `NathaliaAvatarRiveLazy` (vetor interativo: blink/visemas de verdade via state
  machine de um `.riv` autorado — ver [`RIVE_SPEC.md`](./RIVE_SPEC.md)). Decisão
  após mount; primeiro paint sempre 2D; fallback 2D enquanto carrega ou sem `.riv`.
  O runtime Rive (WASM) só entra pelo chunk lazy, nunca no bundle inicial.

SSR-safe; sem WebGL/3D. Detalhes de animação em
[`ANIMATION_SYSTEM.md`](./ANIMATION_SYSTEM.md).

## Flags de ambiente

| Flag | Efeito |
| ---- | ------ |
| `NEXT_PUBLIC_NATHALIA_2D_EXPR=false` | Usa o avatar SVG em vez do ilustrado |
| `NEXT_PUBLIC_NATHALIA_RIVE=true` | Usa o avatar Rive (precisa do `.riv`; senão cai no 2D) |

> Flags antigas de 3D (`NEXT_PUBLIC_ENABLE_NATHALIA_3D`) foram **removidas**.

## RBAC e segurança

`nathaliaPermissions.ts` decide acesso a contexto, execução de ação e tópicos
sensíveis (financeiro, aprovações) a partir dos `roles` do `NathaliaUser`. O
host valida no servidor. Nenhuma ação desta fase escreve dado ou toca regra de
negócio crítica.

## Testes

`apps/web/src/components/nathalia/__tests__/` e `apps/web/src/lib/nathalia/`
cobrem placement, inteligência, framing, polish e signals. Rodam em `vitest`.
