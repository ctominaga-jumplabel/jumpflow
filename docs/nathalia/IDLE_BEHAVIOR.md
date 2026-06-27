# Nathal.IA — Idle Behavior (Sistema de vida visual)

> O **comportamento de repouso** da Nathal.IA: o que a personagem faz quando
> ninguém está "falando" com ela. Documenta o que o código realmente executa em
> runtime (Fase 7, Etapa 8) — piscar aleatório, pulso de sorriso, respiração — e
> a regra-mãe **"nunca parecer robótica"**.
>
> Hierarquia de canon (do mais forte ao mais fraco):
>
> 1. Código de runtime — `packages/character-nathalia/src/nathaliaIdle.ts` +
>    o `useFrame` de `NathaliaModel.tsx` (fonte de verdade do que acontece).
> 2. Este documento (descreve o runtime).
> 3. Blueprints de intenção — [`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md),
>    [`EXPRESSIONS.md`](./EXPRESSIONS.md), [`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md).
>
> Integração geral: [`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md).
>
> Última atualização: **2026-06-17**.

---

## 1. Por que existe

O corpo da Nathal.IA já se mexe sozinho: o clipe `Idle` faz **loop** (respiração
+ leve deslocamento de peso). Mas um personagem só parece **vivo** com
micro-comportamentos involuntários por cima do loop corporal. A Etapa 8 adiciona
duas camadas faciais, calculadas **quadro a quadro** no `useFrame` de
`NathaliaModel`, em cima da expressão de repouso do estado atual
(`morphTargetsForState`):

- **Blink loop** — piscar ocasional, às vezes duplo, sobre os morphs
  `Blink_L` / `Blink_R`.
- **Smile pulse** — pulso suave de sorriso somado ao peso `Smile` do estado.

O módulo `nathaliaIdle.ts` é **puro, sem three.js e sem efeito colateral** — só
guarda os "diais" (config) e dois helpers. A aleatoriedade vive no consumidor
(`NathaliaModel`), não no módulo, para manter os helpers testáveis.

---

## 2. Configuração exata (`nathaliaIdleConfig`)

Valores reais em `nathaliaIdle.ts`:

### Blink (`NathaliaBlinkConfig`)

| Campo | Valor | Significado |
| --- | --- | --- |
| `minIntervalSec` | `2.4` | menor intervalo entre piscadas |
| `maxIntervalSec` | `6.0` | maior intervalo entre piscadas |
| `durationSec` | `0.16` | tempo de uma piscada (fecha + abre) |
| `doubleBlinkChance` | `0.18` | 18% de chance da piscada vir em **dupla** imediata |
| `closedWeight` | `1` | peso máximo da pálpebra fechada (0–1) |

### Micro-movimento (`NathaliaMicroMotionConfig`)

| Campo | Valor | Significado |
| --- | --- | --- |
| `smilePulse` | `0.06` | amplitude do pulso de sorriso somado ao `Smile` do estado |
| `smilePulsePeriodSec` | `7` | período do pulso de sorriso, em segundos |

---

## 3. Como o runtime usa (loop do `useFrame`)

A cada quadro, `NathaliaModel` recalcula os pesos de morph dos meshes que
expõem `morphTargetDictionary`/`morphTargetInfluences` (hoje só o corpo). O fluxo:

1. **Zera** todas as influências e reaplica os pesos de repouso do estado
   (`baseWeights = morphTargetsForState(state)`).
2. **Smile pulse** — quando há `dict.Smile`, soma
   `smilePulse * (0.5 + 0.5 * sin(2π·t / period))` ao peso `Smile`, com `clamp` em 1.
   O `0.5 + 0.5·sin(...)` mantém o pulso sempre **positivo** (0 → `smilePulse`),
   então o sorriso só "respira" para cima, nunca abaixo do repouso.
3. **Blink** — máquina de estado em `blink.current` (`phase: "idle" | "blink"`):
   - Em `idle`, agenda a próxima piscada para `t + nextBlinkDelaySec(...)`.
   - Quando `t >= nextAt`, entra em `blink`, guarda `startT` e sorteia
     `doubles = Math.random() < doubleBlinkChance ? 1 : 0`.
   - Durante a piscada, o peso vem de `blinkWeightAt(dt, durationSec) * closedWeight`.
   - Ao terminar a piscada: se `doubles > 0`, **reinicia imediatamente** (piscada
     dupla); senão volta a `idle` e reagenda.
   - O peso de blink é aplicado com `Math.max` sobre `Blink_L` e `Blink_R`
     (nunca apaga uma expressão de repouso menor; sempre vence a piscada).

### Helpers (`nathaliaIdle.ts`)

| Helper | O que faz |
| --- | --- |
| `nextBlinkDelaySec(cfg, rand)` | sorteia o próximo atraso dentro de `[min, max]`; recebe a fonte aleatória (determinístico em teste) |
| `blinkWeightAt(t, durationSec)` | peso da pálpebra (0–1) em `t` segundos da piscada — **triângulo simétrico** fecha→abre; 0 fora da janela |

`blinkWeightAt` é simétrico: sobe linearmente até a metade da duração (pálpebra
fechando) e desce na segunda metade (abrindo). Fora de `(0, durationSec)` retorna 0.

---

## 4. Respiração corporal

A respiração **não** está no `nathaliaIdle.ts` — ela vem do clipe `Idle` em
loop (`LoopRepeat`), tocado pelo mixer do `useAnimations`. O idle facial
(blink + smile pulse) é **independente** do clipe corporal e roda mesmo quando o
estado usa outro clipe (ex.: `Explaining`, `Pointing`), pois o `useFrame` opera
diretamente nos morphs, não no mixer.

---

## 5. Reduced motion

Sob `prefers-reduced-motion` (no modo `auto`), o avatar 3D normalmente nem é
montado e cai para o 2D/CSS (ver [`REACT_THREE_FIBER_INTEGRATION.md`](./REACT_THREE_FIBER_INTEGRATION.md) §6).
Quando o 3D **é** forçado (`variant="3d"`) com reduced motion, o `NathaliaModel`
recebe `animate=false` e:

- o mixer corporal congela (`mixer.timeScale = 0`, pose estática);
- no `useFrame`, **`blinkW` e `smilePulse` permanecem 0** — só a expressão de
  repouso do estado (`baseWeights`) é aplicada.

Resultado: **nenhum** piscar, pulso ou respiração — apenas a expressão estática.
Sem movimento involuntário, conforme a preferência do usuário.

---

## 6. Regras "não parecer robótica"

- **Intervalo sorteado**, nunca fixo: `[2.4s, 6.0s]` por piscada.
- **Piscada rápida** (`0.16s`) e ocasionalmente **dupla** (18%), como olhos reais.
- **Aplicação não-destrutiva**: blink usa `Math.max` e o smile pulse soma com
  `clamp`, então o idle nunca "engole" a expressão de repouso do estado.
- **Pulso de sorriso lento e raso** (amplitude `0.06`, período `7s`): perceptível
  só no subconsciente, nunca um "sorriso piscante".
- **Congela por completo** em reduced motion — respeito > vivacidade.

---

## 7. Ideias futuras (ainda não no código)

- **Micro head-look** via *additive bone track* (leve deriva de cabeça/pescoço)
  somada ao `Idle`, para o olhar não ficar travado.
- **Gaze toward cursor** — orientar levemente cabeça/olhos na direção do ponteiro
  (apenas no painel/widget, fora de fluxos operacionais densos).
- **Variação de respiração** por estado (mais lenta em `idle`, mais alerta em
  `thinking`).
- Estes itens devem manter as mesmas garantias: puros nos diais, frame-driven no
  consumidor e **congelados em reduced motion**.

---

## 8. Arquivos desta etapa

| Arquivo | Papel |
| --- | --- |
| `src/nathaliaIdle.ts` | config (`nathaliaIdleConfig`) + helpers `nextBlinkDelaySec`, `blinkWeightAt` |
| `src/NathaliaModel.tsx` | loop `useFrame` que dirige blink + smile pulse sobre os morphs |
| `src/nathaliaAnimations.ts` | `morphTargetsForState` (expressão de repouso base por estado) |
