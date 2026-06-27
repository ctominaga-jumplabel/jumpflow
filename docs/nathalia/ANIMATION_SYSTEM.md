# Nathal.IA — Sistema de Animação (2D)

Animações **funcionais e contidas**, feitas com **`motion`** (importado de
`motion/react`, a evolução do Framer Motion). Toda animação respeita
`prefers-reduced-motion` via `useReducedMotion()` — sob redução, microvidas e
loops param e transições viram instantâneas.

## Princípios

- **Funcional, não decorativa.** Cada movimento comunica estado (pensando,
  falando, alerta) ou dá vida discreta.
- **Sem parallax/scroll** em fluxos operacionais (regra do projeto).
- **Reduced-motion é cidadão de primeira classe**, não um afterthought.
- **Leve**: transforms/opacity (compositáveis); nada de layout thrash.

## Inventário de animações

| Animação | Onde | Como |
| -------- | ---- | ---- |
| **idle breathing** | avatar (idle) | `y`/`rotate` suaves em loop ~6s (`NathaliaAvatar2DExpr`) |
| **blink** | avatar | squash de `scaleY`→~0.08 em intervalos de `nextBlinkDelaySec()` (`nathaliaIdle.ts`) |
| **side-glance** | avatar | a cada ~4 piscadas, leve `translateX` |
| **wave** | welcome | expressão `animada` + entrada com `scale`/`opacity` (header do painel) |
| **attention pulse** | launcher | halo `scale`/`opacity` em loop quando há nudge (`NathaliaWidget`) |
| **celebrate bounce** | celebrate | estado transitório + `NathaliaConfetti` |
| **speaking mouth swap** | avatar | troca cíclica de visemas (lip-sync simulado) + "nod" mais rápido |
| **worried subtle shake** | warning/worried | micro-oscilação (estado `warning`) |
| **alert pop** | alert/pointing | entrada com `scale` + badge de notificação |

## Microvida no idle (Nível 1)

`NathaliaAvatar2DExpr` combina, no estado idle:

1. **Respiro/sway**: `motion.div` com `y: [0, -size*0.02, 0]` e leve `rotate`,
   loop ~6s.
2. **Piscar**: camada que comprime `scaleY` rapidamente; timing de
   `nextBlinkDelaySec()` para parecer natural; nunca pisca durante lip-sync.
3. **Olhada de lado** ocasional para reforçar presença.

Tudo inerte sob reduced-motion.

## Fala (speaking mouth swap)

Quando `speaking=true`:

- Se houver **visema de áudio** (`viseme` no store, futuro TTS), a boca segue
  esse visema (preciso).
- Senão, cicla uma sequência natural de visemas (`VISEME_SEQUENCE`, ~110ms/frame)
  — o **mouth swap simulado**.
- O corpo troca o loop idle por um "nod" mais rápido para a fala ler bem mesmo
  pequena. Piscar é suspenso para não brigar com os frames de boca.

Dispare via `nathaliaEngine.speak(text)` ou `startNathaliaSpeaking(ms)`. Veja
[`LIPSYNC_PLAN.md`](./LIPSYNC_PLAN.md).

## Transições de expressão

Mudanças de **expressão** usam crossfade suave (`opacity`, ~0.3s). Mudanças de
**visema** são **snap** (duração 0) para a fala parecer articulada. Assets são
pré-carregados (`reachableExpressions()` + sequência de visemas) para o swap não
piscar.

## Estados ⇄ intenção ⇄ cor

Cada estado tem uma **intenção** (`neutral|positive|info|attention|negative`,
`nathaliaStates.ts`) que define o disco/anel de cor por trás do avatar
(`intentAccent`), mantendo coerência sem hard-code por estado.

## Como testar

No Lab (`/app/dev/nathalia`): seção **Animações** (falar/comemorar/alerta/
pensando/idle), grade de **Expressões**, e **Visemas** com "tocar fala (ciclar)".
