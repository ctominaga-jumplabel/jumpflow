# Nathal.IA — Guia de Animação

> Como a personalidade da Nathal.IA vira movimento. Cobre os clipes 3D
> esperados, a relação com os estados emocionais e o comportamento de fallback
> 2D que já existe hoje.
>
> Estados: `packages/character-nathalia/src/nathaliaStates.ts`.
> Clipes/fallback: `packages/character-nathalia/src/nathaliaAnimations.ts`.

## Princípios de movimento (Playful Ops)

- **Funcional e contido** nos fluxos centrais (horas, aprovações, alocação, financeiro).
- Microinterações curtas (1–4s); **idle em loop**, reações em `once`.
- Energia positiva, sem exagero — a Nathal.IA é leve, não hiperativa.
- **Respeitar `prefers-reduced-motion`**: reduzir/parar idle e suavizar reações.
- Sem parallax/scroll effects nos fluxos operacionais (regra do projeto).

## Estados → clipes

Cada estado emocional aponta para um clipe. Hoje há duas camadas: o **nome do
clipe esperado no rig** e o **fallback 2D** (bob/tilt/pulse) que anima o avatar
CSS antes de existir qualquer `.glb`.

| Estado | Clipe (pacote) | Clipe no rig (alvo) | Loop |
| --- | --- | --- | --- |
| `idle` | `idleBreath` | `Idle` | loop |
| `listening` | `nod` | `Idle`/`Nod` | loop |
| `welcome` | `wave` | `Wave` | once |
| `thinking` | `thinking` | `Thinking` | loop |
| `searching` | `search` | `Thinking`/`LookAround` | loop |
| `explaining` | `explain` | `Explaining` | loop |
| `pointing` | `point` | `Pointing` | once |
| `happy` | `happy` | `Celebrate`/`Happy` | once |
| `warning` | `warn` | `Alert` | once |
| `error` | `shrug` | `Alert`/`Shrug` | once |
| `success` | `thumbsUp` | `Celebrate`/`ThumbsUp` | once |
| `celebrate` | `celebrate` | `Celebrate` | once |

> **Reconciliação:** as `Actions` canônicas do `master.glb` estão em
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) §8 (`Idle, Wave, Thinking,
> Pointing, Explaining, Celebrate, Typing, Alert`). Na integração (Fase 5), o
> mapeamento clip-do-rig → estado será ajustado em `nathaliaAnimations.ts`. A
> validação trata nomes de animação de forma tolerante.

## Shape keys (expressão facial)

As expressões da [`CHARACTER_SHEET_SPEC.md`](./CHARACTER_SHEET_SPEC.md) viram
shape keys combináveis com os clipes corporais:

| Shape key | Quando usar |
| --- | --- |
| `Smile` | happy, success, welcome, celebrate |
| `Blink_L` / `Blink_R` | piscar idle (vida), aleatório |
| `Thinking` | thinking, searching |
| `Surprised` | reações de surpresa |
| `OpenMouth` | falando (combina com qualquer clipe) |
| `Sad` | warning, error (suave, nunca dramático) |

Idle "vivo": piscar a cada poucos segundos + respiração (`Idle` loop). Falar:
`OpenMouth` modulado durante a fala.

## Fallback 2D (hoje)

Sem `.glb`, o `NathaliaAvatar.tsx` usa hints de `nathaliaAnimations.ts`:

- `bob` — oscilação vertical (px).
- `tilt` — rotação (graus).
- `pulse` — leve escala.

Cada estado tem um perfil (ex.: `celebrate` = bob 8 / tilt 6 / pulse 0.06;
`thinking` = bob 1 / tilt 6 / pulse 0). Isso dá personalidade ao avatar CSS
**antes** do 3D existir. Reduced-motion zera/atenua esses valores.

## Diretrizes de timing

| Tipo | Duração | Loop | Exemplo |
| --- | --- | --- | --- |
| Idle | 4s | loop | respiração |
| Reação positiva | 1.3–2s | once | wave, thumbsUp, celebrate |
| Pensar/buscar | 2–2.4s | loop | thinking, search |
| Explicar/apontar | 1.2–2.4s | loop/once | explain, point |
| Alerta | 1.2s | once | warn, shrug |

## Acessibilidade

- `prefers-reduced-motion`: idle vira pose estática + piscar mínimo; reações
  encurtam e perdem amplitude.
- Animação **nunca** é o único canal de informação — sempre há texto/estado no UI.
- Foco e leitura por leitor de tela não dependem de movimento.
