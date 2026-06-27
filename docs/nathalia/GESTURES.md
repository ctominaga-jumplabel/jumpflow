# Nathal.IA — Gestos (Gesture Sheet)

> Catálogo definitivo dos **gestos corporais** da Nathal.IA. Fonte de verdade
> para as **Actions** do `master.glb` (Blender → React Three Fiber). Não gera
> código nem GLB.
>
> Gestos mapeiam para as **Actions canônicas** do `master.glb`
> (`Idle, Wave, Thinking, Pointing, Explaining, Celebrate, Typing, Alert` —
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) §8) e para os estados/clipes do
> pacote ([`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md),
> `nathaliaAnimations.ts`).
>
> Princípios de movimento (Playful Ops): **funcional e contido**, microinterações
> curtas, energia positiva sem exagero, `prefers-reduced-motion` sempre
> respeitado. Sem parallax/scroll nos fluxos operacionais.
>
> Última atualização: **2026-06-16**.

## Como ler esta folha

Para cada gesto: **descrição**, **uso** (estado/contexto), **intensidade**
(escala 1–5 de amplitude/energia) e **duração recomendada**. Combinam com as
expressões faciais de [`EXPRESSIONS.md`](./EXPRESSIONS.md).

**Restrições do rig (importante para todos os gestos):**

- Rig humanoide simples; **sem bones de dedos individuais** no MVP
  (GLB Requirements §6). Gestos de mão (`wave`, `point`, `thumbsUp`) resolvem-se
  na **forma esculpida da mão + pose do antebraço**, não em dedos articulados.
- Cabelo majoritariamente rígido; movimento secundário leve só em `wave`/
  `celebrate` (1–2 bones opcionais ou shape keys).
- Toda Action tem **frame inicial = pose neutra** para blend suave entre estados.

| Intensidade | Significado |
| --- | --- |
| 1 | quase imperceptível (respiração, micro) |
| 2 | sutil (aceno de cabeça, leve) |
| 3 | moderado (gesto de mão claro) |
| 4 | expressivo (braço inteiro) |
| 5 | amplo (corpo todo, comemoração) |

---

## 1. idle

- **Descrição:** pose-base viva — respiração sutil (tórax/ombros sobem-descem),
  micro-balanço de peso, piscar aleatório. A personagem "está lá", relaxada e
  atenta. Sem deslocamento.
- **Uso:** `idle`, `listening`. Estado-base, **loop** permanente quando ociosa.
- **Intensidade:** 1.
- **Duração:** ~4 s por ciclo, **loop** contínuo.
- **Action:** `Idle`. Expressão: Neutral.
- **Reduced-motion:** pose estática + piscar mínimo.

## 2. wave (acenar)

- **Descrição:** levanta um braço (~ombro) e acena com a mão aberta 2–3 vezes,
  leve balanço de cabeça e sorriso. Pequeno movimento secundário do cabelo.
- **Uso:** `welcome` — boas-vindas, início de tour, primeiro contato.
- **Intensidade:** 4.
- **Duração:** ~1.3–2 s, `once` (depois volta a `idle`).
- **Action:** `Wave`. Expressão: Greeting.
- **Reduced-motion:** mão sobe para posição de aceno e segura (sem oscilar).

## 3. point (apontar)

- **Descrição:** estende o braço e aponta com a mão (formato apontando esculpido)
  para um elemento da UI/direção. Olhar acompanha a direção do gesto.
- **Uso:** `pointing` — destacar onde clicar, indicar um campo, passos de tour.
- **Intensidade:** 3.
- **Duração:** ~1.2–1.8 s, `once` (pode segurar enquanto o destaque está ativo).
- **Action:** `Pointing`. Expressão: Explaining.
- **Reduced-motion:** braço vai direto à pose final apontando, sem arco.

## 4. explain (explicar)

- **Descrição:** ambas as mãos gesticulam de forma aberta e didática
  (apresentando, "isso aqui funciona assim"), acenos curtos de cabeça, fala
  (`OpenMouth` modulado). Movimento rítmico e calmo.
- **Uso:** `explaining` — passo a passo, dicas, didática.
- **Intensidade:** 3.
- **Duração:** ~1.2–2.4 s, **loop** suave enquanto explica.
- **Action:** `Explaining`. Expressão: Explaining.
- **Reduced-motion:** mãos em pose aberta estática + fala mínima.

## 5. celebrate (comemorar)

- **Descrição:** braços para cima/abertos, leve salto ou bounce, cabeça
  levantada, sorriso grande. O gesto mais amplo do repertório. Cabelo acompanha
  com leve movimento secundário. (Confete fica na UI, não no modelo.)
- **Uso:** `celebrate` — conquistas/marcos (fechamento, meta batida).
- **Intensidade:** 5.
- **Duração:** ~1.5–2 s, `once`.
- **Action:** `Celebrate`. Expressão: Celebrate.
- **Reduced-motion:** braços sobem para pose festiva e seguram (sem salto).

## 6. typing (digitando)

- **Descrição:** mãos à frente em gesto de digitação leve (movimento sutil de
  antebraço/mão), olhar concentrado para baixo/à frente. Sugere "estou
  trabalhando nisso". Sem teclado modelado (gesto implícito).
- **Uso:** processamento/execução mais longa, "estou preparando isso".
- **Intensidade:** 2.
- **Duração:** **loop** curto (~1.5–2 s) enquanto a tarefa roda.
- **Action:** `Typing`. Expressão: Focused.
- **Reduced-motion:** pose de mãos à frente estática.

## 7. thinking (pensar)

- **Descrição:** uma mão sobe em direção ao queixo (pose pensativa), olhar
  desviado para cima/lado, cabeça inclinada. Leve, sem ansiedade.
- **Uso:** `thinking`, `searching` — analisando, buscando.
- **Intensidade:** 2.
- **Duração:** ~2–2.4 s, **loop** suave.
- **Action:** `Thinking`. Expressão: Thinking.
- **Reduced-motion:** mão no queixo estática + cabeça inclinada.

## 8. greeting (saudação ampla)

- **Descrição:** variação acolhedora do `wave` com o corpo levemente voltado ao
  usuário e mão aberta em apresentação ("seja bem-vindo(a)"). Mais "recepção" que
  "tchau". Pode encadear com `wave`.
- **Uso:** `welcome` em contexto de recepção/onboarding (primeira sessão).
- **Intensidade:** 3.
- **Duração:** ~1.5–2 s, `once`.
- **Action:** `Wave`/`Explaining` combinados. Expressão: Greeting.
- **Reduced-motion:** pose de recepção estática (mão aberta, sorriso).

---

## Mapa rápido: gesto → Action canônica → estado

| Gesto | Action (`master.glb`) | Estado(s) | Loop | Intensidade |
| --- | --- | --- | --- | --- |
| idle | `Idle` | idle, listening | loop | 1 |
| wave | `Wave` | welcome | once | 4 |
| point | `Pointing` | pointing | once | 3 |
| explain | `Explaining` | explaining | loop | 3 |
| celebrate | `Celebrate` | celebrate | once | 5 |
| typing | `Typing` | (execução/futuro) | loop | 2 |
| thinking | `Thinking` | thinking, searching | loop | 2 |
| greeting | `Wave`+`Explaining` | welcome | once | 3 |

> **Reconciliação de nomes:** o pacote (`nathaliaAnimations.ts`) usa chaves um
> pouco diferentes (`Nod, LookAround, Point, Happy, Warn, Shrug, ThumbsUp`). O
> canon de Actions do `master.glb` está em GLB Requirements §8; a validação é
> **tolerante a nomes** (D-009) e a reconciliação clip→estado acontece na Fase 5.
>
> **Diretrizes de timing** completas em
> [`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md): idle 4 s loop; reação positiva
> 1.3–2 s once; pensar/buscar 2–2.4 s loop; explicar/apontar 1.2–2.4 s; alerta
> 1.2 s once. Todo gesto encurta e perde amplitude sob `prefers-reduced-motion`.
