# Nathal.IA — Evolução das Expressões (Etapa 6)

> **Como o conjunto de expressões evoluiu** entre o `master.glb` V1 (7 shape keys)
> e o `master_v2.glb` (10 shape keys). Documenta o refinamento das 7 originais e
> as 3 novas (`Curious`, `Greeting`, `Celebrate`), com objetivo, intensidade,
> contextos de uso e combinações recomendadas. Não gera código nem GLB.
>
> Canon de expressões: [`EXPRESSIONS.md`](./EXPRESSIONS.md) (folha definitiva de
> expressões/estados). Planta das shape keys: [`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md).
> Construção real das 10 chaves: `_add_shape_keys` em
> [`construct_master_v2.py`](../../scripts/nathalia/blender/construct_master_v2.py).
> Mapeamento estado→peso em runtime: `stateToMorphTargets` em
> [`nathaliaAnimations.ts`](../../packages/character-nathalia/src/nathaliaAnimations.ts).
>
> Hierarquia de canon: `EXPRESSIONS.md` define a **direção emocional**;
> `SHAPE_KEYS_BLUEPRINT.md` define **uso/combinação** de cada chave; este
> documento explica a **evolução** e os **pesos de repouso por estado**. Quando
> houver divergência de intenção, prevalece `EXPRESSIONS.md`; quando houver
> divergência de pesos aplicados, prevalece `stateToMorphTargets`.
>
> Última atualização: **2026-06-17**.

---

## Por que evoluímos o conjunto

O V1 cobria a base emocional (sorrir, piscar, pensar, surpresa, tristeza/alerta,
falar), mas dependia de **combinações** para algumas leituras frequentes do
produto — em especial recepção (`welcome`) e comemoração (`celebrate`), que
ficavam só por `Smile + OpenMouth`. Isso limitava a expressividade de momentos de
alta carga emocional e empurrava trabalho para o runtime.

Na Etapa 6 os detalhes faciais (sobrancelhas, íris, boca) passaram a morar na
**malha Body** (Body mesh). Com isso todas as 10 shape keys são **offsets
regionais de vértices na região do rosto**, **não-destrutivos** e neutros em `0`.
As novas chaves entregam, em uma única chave, leituras antes só obtidas por soma
— deixando a soma livre para nuance, não para o básico.

> Restrição transversal mantida do V1: nenhuma chave deve quebrar a malha em
> `1.0` (sem clipping de dentes/olhos), e as combinações proibidas continuam
> válidas (ver `SHAPE_KEYS_BLUEPRINT.md`).

---

## As 7 shape keys do V1 (refinadas)

As 7 originais permanecem canônicas e mantêm nome e papel. Na V2 deformam os
detalhes faciais agora presentes na malha Body, o que melhora a legibilidade sem
mudar o contrato.

| Shape key | Objetivo | Intensidade recomendada | Onde é usada |
| --- | --- | --- | --- |
| `Smile` | Cantos da boca para cima + leve elevação de bochecha | `0.15` micro (idle) · `0.35` simpatia (listening) · `0.75–0.9` sorriso claro | `idle`, `listening`, `explaining`, `pointing`, `happy` |
| `Blink_L` | Fecha a pálpebra esquerda (piscar/piscadela) | `1.0` no pico, curva rápida | loop de piscar (runtime, todos os estados) |
| `Blink_R` | Fecha a pálpebra direita (simétrico) | `1.0` no pico, curva rápida | loop de piscar (runtime, todos os estados) |
| `Thinking` | Uma sobrancelha erguida + leve franzir (olhar pensativo) | `0.3–0.7` legível; evitar `1.0` | `thinking`, `searching` |
| `Surprised` | Sobrancelhas altas + leve abertura (atenção/espanto leve) | `0.35` atenção (warning) · até `0.8` espanto curto | `warning`, reações pontuais |
| `Sad` | Cantos para baixo + sobrancelha interna alta (preocupação suave) | `0.3` preocupação · `0.55` erro · evitar `1.0` melodramático | `error`, alerta suave |
| `OpenMouth` | Boca aberta para fala / ênfase | `0.12` fala discreta · `0.2–0.5` fala normal (loop) | `explaining`, fala em qualquer estado |

Refinamento de leitura na V2: como os detalhes vivem na malha Body, `Smile` e
`OpenMouth` combinam de forma mais limpa durante a fala (visemas), e `Thinking`/
`Surprised` ganham contraste de sobrancelha mais nítido.

---

## As 3 novas shape keys do V2

### `Curious`

- **Objetivo.** Convite sustentado à interação / descoberta — interesse genuíno,
  não reação de susto.
- **Construção.** Uma sobrancelha sobe (lado esquerdo, `x>0`) **+** leve elevação
  do canto oposto da boca, criando a assimetria inquisitiva ("hmm, interessante").
- **Intensidade.** `0.3–0.5` é o sweet spot (convite leve). Acima de `0.6` começa
  a competir com `Surprised`/`Thinking` na sobrancelha.
- **Contextos.** `searching` (combinada com `Thinking`), ações proativas de
  sugestão/descoberta. Distinta de `Surprised`: `Curious` é **sustentada e
  suave**; `Surprised` é **curta e pontual**.
- **Combina com.** `Thinking` (busca curiosa), `Smile` leve (interesse simpático).
- **Evita.** `Surprised` alto (concorrência de sobrancelha), `Sad`.

### `Greeting`

- **Objetivo.** Recepção calorosa — primeira impressão acolhedora no `welcome`.
- **Construção.** Sorriso **aberto** mais forte: maior elevação dos cantos +
  bochechas + uma pequena queda de mandíbula (boca levemente aberta, "oi!").
  Entrega em uma chave o que o V1 fazia com `Smile ~0.8 + OpenMouth ~0.2`.
- **Intensidade.** `0.6–0.7` é o repouso típico de recepção. `1.0` é caloroso
  amplo (use com o clipe `Greeting`/`Wave`).
- **Contextos.** `welcome` (entrada no app, início de tour) e `success`/`happy`
  como reação positiva calorosa (runtime usa `Greeting` para `welcome`, `happy` e
  `success`).
- **Combina com.** `Blink_*` (sorriso que chega aos olhos), `OpenMouth` leve para
  "oi!". 
- **Evita.** `Sad` (anulam-se), `Surprised` alto.

### `Celebrate`

- **Objetivo.** Comemorar uma conquista maior (fechamento, meta, marco) — a
  expressão mais ampla do conjunto.
- **Construção.** Sorrisão aberto: cantos bem para cima **+** bochechas **+**
  sobrancelhas para cima **+** queda de mandíbula (grin aberto). Combina a energia
  de `Surprised` (sobrancelhas) com a de `Greeting` (sorriso aberto).
- **Intensidade.** `0.85` é o repouso de comemoração (valor de runtime). `1.0`
  para o pico do clipe `Celebrate` (braços para cima).
- **Contextos.** `celebrate` e `success` no nível de marco. Sempre `once` no
  corpo (clipe `Celebrate`), nunca em loop — comemoração sustentada cansa.
- **Combina com.** clipe corporal `Celebrate`; confete fica na **UI**, não no
  modelo.
- **Evita.** loop; `Sad`; manter por muito tempo (volta ao `Idle`/Neutral).

---

## Mapa: estado emocional → pesos de repouso (shape keys)

Pesos de **repouso** aplicados por estado, conforme `stateToMorphTargets`
(`nathaliaAnimations.ts`). O loop de piscar (`Blink_L`/`Blink_R`) é
**dirigido em runtime** e roda por cima destes pesos em quase todos os estados —
ver "Piscar" abaixo. `OpenMouth` modulado durante a fala também é runtime.

| Estado (`nathaliaStates`) | Shape keys de repouso | Leitura |
| --- | --- | --- |
| `idle` | `Smile` 0.15 | presença calma, micro-sorriso |
| `listening` | `Smile` 0.35 | atenção amistosa |
| `welcome` | `Greeting` 0.7 | recepção calorosa |
| `thinking` | `Thinking` 0.7 | pensando, sem ansiedade |
| `searching` | `Thinking` 0.5 + `Curious` 0.4 | busca curiosa |
| `explaining` | `Smile` 0.3 + `OpenMouth` 0.12 | didática falante |
| `pointing` | `Smile` 0.25 | indica com simpatia |
| `happy` | `Smile` 0.75 | feliz claro |
| `warning` | `Surprised` 0.35 | atenção leve, sem susto |
| `error` | `Sad` 0.55 | preocupação gentil |
| `success` | `Greeting` 0.6 | sucesso caloroso |
| `celebrate` | `Celebrate` 0.85 | comemoração ampla |

> **Reconciliação com `EXPRESSIONS.md`:** a folha de expressões descreve a
> *intenção artística* (ex.: `welcome` = Greeting com `Smile 0.8 + OpenMouth 0.2`).
> A V2 condensa essa intenção na chave `Greeting`, então o **peso aplicado** em
> runtime é `Greeting 0.7`. Os dois descrevem a mesma leitura por caminhos
> diferentes (soma vs. chave dedicada); o valor de runtime é a fonte de verdade
> do que o modelo recebe.

### Piscar (loop de vida)

`Blink_L` + `Blink_R` **não** aparecem em `stateToMorphTargets` como peso de
repouso porque são um **loop dirigido em runtime** (piscar aleatório a cada poucos
segundos, curva rápida e simétrica), independente do estado e somado por cima dos
pesos da tabela. É a base do "idle vivo" e roda em quase todos os estados.
Suprimir só no pico de `Surprised` (olhos arregalados). Detalhes de timing e do
comportamento sob `prefers-reduced-motion` (piscar mínimo) em
[`ANIMATION_GUIDE.md`](./ANIMATION_GUIDE.md) §idle/piscar.

---

## Combinações recomendadas (V2)

| Momento | Shape keys | Observação |
| --- | --- | --- |
| Recepção (`welcome`) | `Greeting` 0.7 (+ `Blink_*` loop) | chave dedicada substitui `Smile+OpenMouth` |
| Busca (`searching`) | `Thinking` 0.5 + `Curious` 0.4 | curiosidade sustentada, não susto |
| Comemoração (`celebrate`) | `Celebrate` 0.85, `once` | volta ao Neutral/Idle depois |
| Fala (`explaining`) | `Smile` 0.3 + `OpenMouth` 0.12 (loop) | `OpenMouth` modulado em runtime |
| Alerta (`warning`) | `Surprised` 0.35 | leve, sem assustar/culpar |
| Erro (`error`) | `Sad` 0.55 | preocupação gentil, nunca dramático |

Combinações **proibidas** (mantidas do V1): `Smile`+`Sad`, `Surprised` alto +
`Blink_*` alto, `Surprised` alto + `Thinking` alto. Para `Curious`, evitar somar
`Surprised` alto (ambos disputam a sobrancelha).

---

## Critérios de validação (resumo)

- [ ] **10 shape keys** existem na malha Body, neutras em `0`: as 7 do V1
      (`Smile, Blink_L, Blink_R, Thinking, Surprised, Sad, OpenMouth`) + as 3 da
      V2 (`Curious, Greeting, Celebrate`).
- [ ] Há `Basis` e nenhuma duplicata (`*.001`).
- [ ] Cada chave é um offset **regional** de vértices no rosto, **não-destrutivo**
      e sem clipping em `1.0`.
- [ ] `stateToMorphTargets` referencia apenas chaves existentes e pesos `0–1`.
- [ ] Piscar é loop de runtime (não peso de repouso) e respeita
      `prefers-reduced-motion`.
