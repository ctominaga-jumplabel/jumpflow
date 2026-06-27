# Nathal.IA — Plano de Refinamento de Animação (Etapa 7)

> **Refinamento dos 9 clipes corporais** do `master_v2.glb` (Etapa 7). Para cada
> Action documenta objetivo, duração, loop, blend e contexto, e descreve como os
> clipes de corpo **se compõem com as shape keys faciais** por estado. Não gera
> código nem GLB.
>
> Construção real dos clipes: `_build_actions` em
> [`construct_master_v2.py`](../../scripts/nathalia/blender/construct_master_v2.py).
> Planta canônica das Actions: [`ACTIONS_BLUEPRINT.md`](./ACTIONS_BLUEPRINT.md).
> Gestos (intenção): [`GESTURES.md`](./GESTURES.md). Expressões/shape keys:
> [`EXPRESSIONS.md`](./EXPRESSIONS.md), [`EXPRESSION_EVOLUTION.md`](./EXPRESSION_EVOLUTION.md).
> Mapas de runtime (`stateToClip`, `clipLoop`, `stateToMorphTargets`):
> [`nathaliaAnimations.ts`](../../packages/character-nathalia/src/nathaliaAnimations.ts).
>
> Hierarquia de canon: `ACTIONS_BLUEPRINT.md` define o **contrato** das Actions
> (nome, loop, faixa de duração); `clipLoop` em `nathaliaAnimations.ts` é a
> **fonte de verdade** de loop vs. once; este documento é o **plano de execução
> artística** e a composição corpo+rosto. Todas as durações abaixo foram
> validadas dentro das janelas do `master_character_config.json` (PASS).
>
> Última atualização: **2026-06-17**.

---

## Princípios do refinamento

- **9 clipes corporais**, `PascalCase`, cada um **começa e termina perto da pose
  neutra** (A-Pose leve) para blend suave entre estados.
- **Sem deslocamento de raiz** (a personagem fica no lugar); energia vem de
  tronco, braços e cabeça.
- **Loop vs. once** é decidido por `clipLoop` (single source of truth), não pelo
  nome do clipe.
- O clipe **corporal não substitui** o rosto: a leitura final é
  **corpo (Action) + rosto (shape keys) + piscar (loop de runtime)**.
- Movimento Playful Ops: **funcional e contido**, microinterações curtas, sem
  parallax/scroll nos fluxos operacionais; `prefers-reduced-motion` sempre
  respeitado (clipes encurtam/viram pose estática).

---

## Os 9 clipes

### 1. `Idle`

- **Objetivo.** Pose-base viva e atenta para onde tudo retorna.
- **Duração.** 4,0 s. **Loop.** loop.
- **Blend.** entrada/saída ~0,3 s; estado de descanso.
- **Contexto.** `idle`, `listening`.
- **Composição facial.** `Smile` 0.15 (idle) / 0.35 (listening) + loop de piscar.

### 2. `Wave`

- **Objetivo.** Aceno de boas-vindas com o braço direito (sobe e acena 2–3×).
- **Duração.** 1,5 s. **Loop.** once (volta ao `Idle`).
- **Blend.** sai do `Idle`, retorna ao `Idle`; pode somar `Smile`/`Greeting`.
- **Contexto.** `welcome`.
- **Composição facial.** `Greeting` (recepção calorosa) + piscar.

### 3. `Thinking`

- **Objetivo.** Pose pensativa — mão ao queixo + cabeça inclinada, sem ansiedade.
- **Duração.** 2,21 s. **Loop.** loop.
- **Blend.** entrada ~0,3 s; sustenta a pose pensativa no miolo do clipe.
- **Contexto.** `thinking`, `searching`.
- **Composição facial.** `Thinking` 0.7 (`thinking`); em `searching`,
  `Thinking` 0.5 + `Curious` 0.4 + piscar.

### 4. `Pointing`

- **Objetivo.** Estende o braço direito à frente e **segura** o aponte.
- **Duração.** 1,5 s. **Loop.** once (pode sustentar o frame final enquanto o
  destaque na UI estiver ativo).
- **Blend.** entrada rápida (~0,2 s); segurar a pose final.
- **Contexto.** `pointing`.
- **Composição facial.** `Smile` 0.25 (indica com simpatia) + piscar.

### 5. `Explaining`

- **Objetivo.** Ambas as mãos gesticulam de forma aberta e ritmada (didática).
- **Duração.** 2,0 s. **Loop.** loop (enquanto explica).
- **Blend.** combina com `OpenMouth` em loop para simular fala.
- **Contexto.** `explaining`.
- **Composição facial.** `Smile` 0.3 + `OpenMouth` 0.12 (modulado em runtime) +
  piscar.

### 6. `Celebrate`

- **Objetivo.** Ambos os braços para cima + pequeno "pulo" do tronco (cabeça
  para cima). O clipe mais amplo.
- **Duração.** 1,75 s. **Loop.** once (volta ao `Idle`; comemoração não fica em
  loop).
- **Blend.** combina com `Celebrate` (shape key); confete fica na UI.
- **Contexto.** `celebrate`, `success`.
- **Composição facial.** `Celebrate` 0.85–1.0 (sorrisão aberto + sobrancelhas) +
  piscar.

### 7. `Typing`

- **Objetivo.** Mãos à frente e baixas com toques alternados sutis (trabalho em
  andamento). Sem teclado modelado.
- **Duração.** 1,5 s. **Loop.** loop (enquanto a tarefa roda).
- **Blend.** sutil; mantém base de mãos à frente, foco para frente/baixo.
- **Contexto.** execução/processamento mais longo (mapeável conforme o produto).
- **Composição facial.** expressão Focused — `Thinking` ~0.3 + `Smile` leve +
  piscar reduzido.

### 8. `Alert`

- **Objetivo.** Recuo rápido + leve tensão (atenção/erro), cabeça para trás.
- **Duração.** 1,17 s. **Loop.** once.
- **Blend.** rápido; combina com `Surprised`/`Sad` leve; volta ao `Idle`.
- **Contexto.** `warning`, `error`.
- **Composição facial.** `Surprised` 0.35 (`warning`) / `Sad` 0.55 (`error`) +
  piscar — sempre "vamos resolver juntos", nunca culpa.

### 9. `Greeting`

- **Objetivo.** "Oi" amigável de mão levantada + aceno/inclinação de cabeça
  (recepção, mais "bem-vindo(a)" que "tchau").
- **Duração.** 1,58 s. **Loop.** once.
- **Blend.** sai e volta ao `Idle`; combina com a shape key `Greeting`.
- **Contexto.** `welcome`, `happy`, `success` (runtime mapeia esses estados a
  este clipe).
- **Composição facial.** `Greeting` 0.6–0.7 (sorriso aberto caloroso) + piscar.

---

## Tabela-resumo

| # | Clipe | Loop | Duração | Shape keys (composição) | Estados (`stateToClip`) |
| --- | --- | --- | --- | --- | --- |
| 1 | `Idle` | loop | 4,0 s | `Smile` 0.15–0.35 + piscar | `idle`, `listening` |
| 2 | `Wave` | once | 1,5 s | `Greeting` | (`welcome` via `Greeting`)¹ |
| 3 | `Thinking` | loop | 2,21 s | `Thinking` 0.7 / +`Curious` 0.4 | `thinking`, `searching` |
| 4 | `Pointing` | once | 1,5 s | `Smile` 0.25 | `pointing` |
| 5 | `Explaining` | loop | 2,0 s | `Smile` 0.3 + `OpenMouth` 0.12 | `explaining` |
| 6 | `Celebrate` | once | 1,75 s | `Celebrate` 0.85 | `success`, `celebrate` |
| 7 | `Typing` | loop | 1,5 s | `Thinking` ~0.3 (Focused) | execução/futuro |
| 8 | `Alert` | once | 1,17 s | `Surprised` 0.35 / `Sad` 0.55 | `warning`, `error` |
| 9 | `Greeting` | once | 1,58 s | `Greeting` 0.6–0.7 | `welcome`, `happy`, `success` |

¹ `Wave` é o aceno canônico de boas-vindas (ver `GESTURES.md`/`ACTIONS_BLUEPRINT.md`),
mas no runtime atual (`stateToClip`) o estado `welcome` resolve para `Greeting`.
`Wave` permanece disponível no GLB para uso direto/futuro.

---

## O Idle mais vivo (V2)

O `Idle` da V2 é deliberadamente **mais vivo** que o do V1 e combina três camadas
no mesmo clipe de 4,0 s (loop):

- **Respiração** — tronco (`Spine`) sobe/desce sutilmente.
- **Mudança de peso** — micro-rotação de `Pelvis`/`Spine`/`Head` para um lado e
  volta, evitando a sensação de "boneco parado".
- **Balanço de braços** — `UpperArm.L`/`UpperArm.R` oscilam de poucos graus,
  reforçando a respiração.

Por cima do clipe roda o **loop de piscar** (`Blink_L`/`Blink_R`), dirigido em
runtime e independente do estado — é o que faz o idle "respirar e olhar". O clipe
começa e termina em pose neutra, então faz blend limpo com qualquer reação.

> **`prefers-reduced-motion`:** o Idle vira **pose estática** (sem respiração/
> balanço) com **piscar mínimo**; reações (`once`) viram transições curtas para a
> pose final. A emoção nunca depende só de movimento — sempre há leitura estática
> equivalente. Ver [`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md).

---

## Composição corpo + rosto por estado

A leitura final de cada estado é sempre **clipe corporal + pesos faciais de
repouso + piscar de runtime**. Os clipes corporais (`stateToClip`) e os pesos
faciais (`stateToMorphTargets`) são camadas independentes que somam:

| Estado | Clipe (corpo) | Shape keys (rosto, repouso) |
| --- | --- | --- |
| `idle` | `Idle` | `Smile` 0.15 |
| `listening` | `Idle` | `Smile` 0.35 |
| `welcome` | `Greeting` | `Greeting` 0.7 |
| `thinking` | `Thinking` | `Thinking` 0.7 |
| `searching` | `Thinking` | `Thinking` 0.5 + `Curious` 0.4 |
| `explaining` | `Explaining` | `Smile` 0.3 + `OpenMouth` 0.12 |
| `pointing` | `Pointing` | `Smile` 0.25 |
| `happy` | `Greeting` | `Smile` 0.75 |
| `warning` | `Alert` | `Surprised` 0.35 |
| `error` | `Alert` | `Sad` 0.55 |
| `success` | `Celebrate` | `Greeting` 0.6 |
| `celebrate` | `Celebrate` | `Celebrate` 0.85 |

> **Nota de reconciliação de nomes.** O brief da tarefa usou os nomes
> `Explain`/`Point`/`Greeting`; os nomes canônicos `PascalCase` dos clipes são
> **`Explaining`**, **`Pointing`** e **`Greeting`**. O pacote 2D legado
> (`nathaliaAnimations.ts` → `nathaliaAnimations`) ainda usa chaves antigas
> (`explain`, `point`, `Nod`, `LookAround`…) para o fallback CSS; o canon 3D da
> V2 é `Idle, Wave, Thinking, Pointing, Explaining, Celebrate, Typing, Alert,
> Greeting` (ver `Nathalia3DClip`/`clipLoop`).

---

## Critérios de validação (resumo)

- [ ] Os **9 clipes** canônicos existem (`PascalCase`, sem `.001`).
- [ ] Cada clipe tem ≥ 1 keyframe e começa/termina perto da pose neutra.
- [ ] **Duração** de cada clipe dentro de `[minSeconds, maxSeconds]` do contrato
      (`master_character_config.json`) — todas PASS na V2.
- [ ] `loop` de cada clipe coerente com `clipLoop` (fonte de verdade):
      `Idle/Thinking/Explaining/Typing` = loop; `Wave/Pointing/Celebrate/Alert/
      Greeting` = once.
- [ ] Cada estado de `stateToClip` aponta para um clipe existente e cada peso de
      `stateToMorphTargets` referencia uma shape key existente.
