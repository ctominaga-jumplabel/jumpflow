# Nathal.IA — Arquitetura de Animação 2D em Camadas

> Sistema modular para animar a Nathal.IA em 2D a partir de imagens organizadas
> em camadas, dirigido por catálogo. Construído **sobre** o avatar de expressões
> existente (`NathaliaAvatar2DExpr`), sem quebrá-lo. Sem 3D, sem GIFs pesados.

## Visão geral

```
catálogo (catalog.json)  →  nathaliaSpriteCatalog.ts  →  Nathalia2DAvatar
        ▲                          (tipos + helpers)            │
        │ catalog_assets.py                                     ▼
   assets/2d/layers/  ──────────────────────────────  NathaliaAnimationController
   (face/visemes/objetos hoje;                          (compõe camadas + motion)
    corpo/poses pendentes)                                      │
                                                                ▼
                                                          NathaliaLayer (×N)
```

O avatar é montado empilhando **camadas** (`NathaliaLayer`) dentro de um quadro
quadrado: `corpo → rosto → boca → objeto`. Qual camada entra e o **motion**
(respiração/balanço/inclinação) vêm do **registro de animação**
(`nathaliaAnimationRegistry.ts`). Quais imagens existem vêm do **catálogo**
(`nathaliaSpriteCatalog.ts`, gerado de `catalog.json`).

### Realidade atual dos assets

As ilustrações de hoje são **bustos de rosto inteiros** (rosto + cabelo +
ombros). Os "visemas" de fala também são **rostos inteiros** com a boca em
formatos diferentes — **não** são bocas transparentes soltas. Por isso a camada
de rosto **troca a imagem inteira** (expressão ↔ visema) em vez de sobrepor uma
boca. Camadas hoje populadas: `face` (expressões), `visemes`, `objects`
(ícones de contexto). Camadas `body`, `arms`, `hands`, `poses`, `eyes`, `mouths`
estão **scaffolded e vazias** — ver [NEXT_STEPS_LIVE2D.md](./NEXT_STEPS_LIVE2D.md).

O `NathaliaAnimationController` já compõe uma camada de **corpo** como base
quando `hasLayer("body")` for verdadeiro — então, quando a arte de corpo for
gerada e catalogada, o compositing passa a acontecer **sem mudança de código**.

## Estados de animação

Definidos em `nathaliaAnimationRegistry.ts` (`NATHALIA_ANIMATION_STATES`):

| Estado        | Fala | Motion     | Loop | Expressão (via contexto/estado) |
|---------------|------|------------|------|---------------------------------|
| `idle`        | não  | calm       | sim  | repouso do contexto             |
| `idle_blink`  | não  | calm       | sim  | repouso + micro-vida            |
| `listening`   | não  | attentive  | sim  | curiosa                         |
| `talking`     | sim  | talk       | sim  | animada + troca de visema       |
| `thinking`    | não  | calm       | sim  | pensativa                       |
| `success`     | não  | emphatic   | não  | empolgada                       |
| `error`       | não  | attentive  | não  | encorajando (nunca culpa)       |
| `alert`       | não  | attentive  | não  | alerta                          |
| `celebrate`   | não  | emphatic   | não  | comemorando                     |
| `wave`        | não  | emphatic   | não  | animada (acolhe)                |

A expressão de cada estado é resolvida reaproveitando `expressionFor(state,
context, override)` de `nathaliaExpressions.ts` (estado → contexto → default).
O `motion` mapeia para keyframes puros em `motionKeyframes(profile, size)`.

## Como o JumpFlow escolhe a animação

`NathaliaAvatar` (o ponto de entrada público) decide o renderizador **após o
mount** (paint inicial sempre seguro):

```
Layered (NEXT_PUBLIC_NATHALIA_2D_LAYERED=true)
  > Rive (NEXT_PUBLIC_NATHALIA_RIVE=true)
  > 2DExpr (default, NEXT_PUBLIC_NATHALIA_2D_EXPR≠false)
  > 2D SVG (fallback sem dependências)
```

O avatar em camadas é **opt-in** (flag `NEXT_PUBLIC_NATHALIA_2D_LAYERED`,
**default OFF**). Com a flag desligada, o app é idêntico ao atual. A prop pública
`state: NathaliaStateKey` é mapeada para um estado de animação por
`layeredAnimationFor()`; a prop `animation` permite forçar um estado direto (Lab).

## Arquivos

| Papel | Arquivo |
|-------|---------|
| Registro de estados + motion (puro) | `packages/character-nathalia/src/nathaliaAnimationRegistry.ts` |
| Catálogo tipado (helpers puros)      | `packages/character-nathalia/src/nathaliaSpriteCatalog.ts` |
| Dados do catálogo (gerado)           | `packages/character-nathalia/src/nathaliaSpriteCatalog.generated.ts` |
| Uma camada (img + crossfade)         | `packages/character-nathalia/src/NathaliaLayer.tsx` |
| Orquestrador (compõe + anima)        | `packages/character-nathalia/src/NathaliaAnimationController.tsx` |
| Avatar público em camadas            | `packages/character-nathalia/src/Nathalia2DAvatar.tsx` |
| Seleção por flag                     | `packages/character-nathalia/src/NathaliaAvatar.tsx` |
| Lab                                  | `apps/web/src/app/app/dev/nathalia/NathaliaLab.tsx` (`/app/dev/nathalia`) |

## Animações leves

Tudo via **Motion** (`motion/react`, já peerDep do pacote) + CSS — sem libs
novas. Inclui: respiração/balanço (perfil de motion), micro-vida (side-glance
ocasional, sem "esmagar" o busto), inclinação leve, crossfade de expressão,
troca de boca na fala, entrada/saída suave. Tudo **congela** sob
`prefers-reduced-motion` e é SSR-safe.

## Como adicionar

- **Nova expressão**: ver [ASSET_CATALOG.md](./ASSET_CATALOG.md).
- **Novo estado de animação**: acrescente a `NATHALIA_ANIMATION_STATES` e
  `DEFS` em `nathaliaAnimationRegistry.ts` (estado emocional + perfil de motion);
  o controller e o Lab passam a exibi-lo automaticamente.
- **Nova camada (corpo/poses)**: gere a arte transparente, rode
  `prepare_layers.py` + `catalog_assets.py`; `hasLayer()` passa a `true` e o
  controller compõe a camada — ver [NEXT_STEPS_LIVE2D.md](./NEXT_STEPS_LIVE2D.md).

## Scripts da pipeline

`scripts/nathalia/2d/` (Python + Pillow):

| Script | O que faz |
|--------|-----------|
| `catalog_assets.py`     | varre e cataloga assets → `catalog.json` + módulo TS |
| `prepare_layers.py`     | monta `assets/2d/` e copia arte para as camadas |
| `optimize_images.py`    | valida transparência + gera exports web normalizados |
| `generate_spritesheet.py` | empacota uma camada em spritesheet + JSON de frames |
| `preview_animations.py` | HTML offline com os 10 estados |
| `generate_face_overlays.py` | gera face-base, olhos e bocas derivadas dos visemas atuais |
