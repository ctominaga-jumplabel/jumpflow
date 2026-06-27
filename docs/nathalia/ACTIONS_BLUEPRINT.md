# Nathal.IA — Actions Blueprint

> **Planta das Actions** (clipes de animação corporais) do `master.glb`. Define
> objetivo, duração, loop, blend recomendado e contextos de uso. Espelha
> [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md) §8 e detalha
> [`GESTURES.md`](./GESTURES.md). Validado por
> [`validate_actions.py`](../../scripts/nathalia/blender/validate_actions.py).
>
> Contrato:
> [`master_character_config.json`](../../scripts/nathalia/blender/master_character_config.json)
> → `actions` (nome, loop, min/max segundos).
>
> Última atualização: **2026-06-17**.

---

## Princípios

- **9 Actions canônicas.** Nomes exatos, `PascalCase`.
- Cada Action **começa e termina perto da pose neutra** (A-Pose leve) para
  permitir blend suave entre estados.
- Animações faciais usam as **shape keys** ([`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md))
  combinadas com a Action corporal — não substituem.
- Nomes **tolerantes** na validação (D-009); a reconciliação clip→estado ocorre
  na Fase 5 em `nathaliaAnimations.ts`.

---

## 1. `Idle`

- **Objetivo.** Respiração viva, micro-balanço, piscadas ocasionais.
- **Duração.** ~3–5 s. **Loop.** sim.
- **Blend.** entrada/saída 0,3 s; é o estado de descanso para onde tudo volta.
- **Contextos.** `idle`, `listening`.

## 2. `Wave`

- **Objetivo.** Aceno de boas-vindas com a mão direita.
- **Duração.** ~1,0–2,2 s. **Loop.** não (once).
- **Blend.** sai do `Idle`, retorna ao `Idle`; pode somar `Smile`.
- **Contextos.** `welcome`.

## 3. `Thinking`

- **Objetivo.** Pose pensativa (mão ao queixo / olhar para cima).
- **Duração.** ~1,8–2,6 s. **Loop.** sim.
- **Blend.** combina com shape key `Thinking`; entrada 0,3 s.
- **Contextos.** `thinking`, `searching`.

## 4. `Pointing`

- **Objetivo.** Apontar para um elemento da UI / direção.
- **Duração.** ~1,0–2,0 s. **Loop.** não (once); pode sustentar o frame final.
- **Blend.** entrada rápida (0,2 s); segurar a pose enquanto destaca.
- **Contextos.** `pointing`.

## 5. `Explaining`

- **Objetivo.** Gesticular ao explicar (mãos abertas, ritmo de fala).
- **Duração.** ~1,0–2,6 s. **Loop.** sim.
- **Blend.** combina com `OpenMouth` (loop) para simular fala.
- **Contextos.** `explaining`.

## 6. `Celebrate`

- **Objetivo.** Comemorar (braços para cima / joinha).
- **Duração.** ~1,2–2,2 s. **Loop.** não (once).
- **Blend.** combina com `Smile` + `OpenMouth`; volta ao `Idle`.
- **Contextos.** `celebrate`, `success`, `happy`.

## 7. `Typing`

- **Objetivo.** Digitar (execução de tarefa / trabalho em andamento).
- **Duração.** ~1,2–2,2 s. **Loop.** sim.
- **Blend.** sutil; mãos à frente, foco para baixo.
- **Contextos.** execução/futuro (`searching` longo, processamento).

## 8. `Alert`

- **Objetivo.** Sinalizar atenção/erro (postura tensa, leve recuo).
- **Duração.** ~0,8–1,6 s. **Loop.** não (once).
- **Blend.** combina com shape key `Sad`/`Surprised` leve; rápido.
- **Contextos.** `warning`, `error`.

## 9. `Greeting`

- **Objetivo.** "Oi" amigável de mão levantada + aceno/inclinação de cabeça
  (recepção calorosa, mais "bem-vindo(a)" que "tchau").
- **Duração.** ~1,0–2,2 s. **Loop.** não (once).
- **Blend.** sai do `Idle`, retorna ao `Idle`; combina com a shape key `Greeting`.
- **Contextos.** `welcome`, `happy` (runtime mapeia `welcome`/`happy`/`success`
  para este clipe; ver `nathaliaAnimations.ts`).

> **Reconciliação de nomes.** O brief usou `Explain`/`Point`/`Greeting`; os nomes
> canônicos `PascalCase` dos clipes são **`Explaining`**, **`Pointing`** e
> **`Greeting`**. A validação é tolerante a nomes (D-009); o canon 3D da V2 é
> `Idle, Wave, Thinking, Pointing, Explaining, Celebrate, Typing, Alert, Greeting`.

---

## Tabela-resumo

| Action | Loop | Duração | Shape keys sugeridas | Estados |
| --- | --- | --- | --- | --- |
| `Idle` | sim | 3–5 s | `Blink_*` ocasional | idle, listening |
| `Wave` | não | 1,0–2,2 s | `Smile` | welcome |
| `Thinking` | sim | 1,8–2,6 s | `Thinking` | thinking, searching |
| `Pointing` | não | 1,0–2,0 s | — | pointing |
| `Explaining` | sim | 1,0–2,6 s | `OpenMouth` | explaining |
| `Celebrate` | não | 1,2–2,2 s | `Smile`+`OpenMouth` | celebrate, success, happy |
| `Typing` | sim | 1,2–2,2 s | — | execução/futuro |
| `Alert` | não | 0,8–1,6 s | `Sad`/`Surprised` leve | warning, error |
| `Greeting` | não | 1,0–2,2 s | `Greeting` | welcome, happy |

---

## Critérios de validação (resumo)

`validate_actions.py` verifica:

- [ ] As **9 Actions** canônicas existem (nomes exatos; D-009 tolerante).
- [ ] **Duração** de cada uma dentro de `[minSeconds, maxSeconds]` do contrato (warning fora da faixa).
- [ ] **Nomenclatura** `PascalCase`, sem `.001` (warning).
- [ ] Cada Action tem ao menos 1 keyframe (não vazia).
