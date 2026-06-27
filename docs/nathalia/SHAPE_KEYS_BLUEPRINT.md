# Nathal.IA — Shape Keys Blueprint

> **Planta das shape keys** (blend shapes faciais) do `master.glb`. Define uso,
> intensidade e combinações permitidas/proibidas de cada uma. Espelha
> [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md) §7 e o mapeamento
> expressão→shape key de [`EXPRESSIONS.md`](./EXPRESSIONS.md). Validado por
> [`validate_shape_keys.py`](../../scripts/nathalia/blender/validate_shape_keys.py).
>
> Contrato:
> [`master_character_config.json`](../../scripts/nathalia/blender/master_character_config.json)
> → `shapeKeys`.
>
> Última atualização: **2026-06-16**.

---

## Princípios

- **7 shape keys canônicas.** Todas neutras em `0`, valor `0.0–1.0`.
- **Não devem quebrar a malha** em `1.0` (sem clipping, sem invasão de dentes/olhos).
- São **combináveis**, mas algumas combinações se anulam ou destroem a leitura —
  ver tabelas de permitidas/proibidas.
- Topologia da Etapa 2 (loops limpos em boca, pálpebras, sobrancelhas) é
  pré-requisito.

---

## 1. `Smile`

- **Uso.** Sorriso: cantos da boca para cima + leve elevação das bochechas.
- **Intensidade.** `0.4` simpatia discreta · `1.0` sorriso amplo.
- **Combina com.** `OpenMouth` (riso/fala feliz), `Blink_*` (sorriso fechando os olhos), `Surprised` (alegria surpresa, leve).
- **Não combinar com.** `Sad` (anulam-se e geram boca ambígua).

## 2. `Blink_L`

- **Uso.** Fecha a pálpebra **esquerda**. Piscar e piscadela.
- **Intensidade.** `1.0` olho totalmente fechado; usar curva rápida no clipe.
- **Combina com.** `Blink_R` (piscar normal), qualquer expressão de boca.
- **Não combinar com.** `Surprised` no mesmo olho (olho arregalado + fechado se anulam).

## 3. `Blink_R`

- **Uso.** Fecha a pálpebra **direita**. Simétrico a `Blink_L`.
- **Intensidade.** `1.0` olho totalmente fechado.
- **Combina com.** `Blink_L` (piscar normal), qualquer expressão de boca.
- **Não combinar com.** `Surprised` no mesmo olho.

## 4. `Thinking`

- **Uso.** Olhar pensativo: uma sobrancelha levemente erguida + leve franzir.
- **Intensidade.** `0.3–0.7` mantém legível; `1.0` pode exagerar.
- **Combina com.** `Smile` leve (curiosidade simpática), `Sad` leve (preocupação).
- **Não combinar com.** `Surprised` em `1.0` (concorrência na sobrancelha).

## 5. `Surprised`

- **Uso.** Olhos arregalados + sobrancelhas altas + boca em "oh".
- **Intensidade.** `0.5` atenção; `1.0` susto.
- **Combina com.** `Smile` (surpresa feliz, ambos ≤ 0.6), `OpenMouth` leve.
- **Não combinar com.** `Blink_L`/`Blink_R` altos (contradição), `Thinking` alto.

## 6. `Sad`

- **Uso.** Tristeza/alerta suave: cantos da boca para baixo + sobrancelha interna alta.
- **Intensidade.** `0.3` preocupação; `0.8` tristeza clara (evitar `1.0` melodramático).
- **Combina com.** `Thinking` (preocupação atenta), `Blink_*`.
- **Não combinar com.** `Smile` (anulam-se), `Surprised` alto.

## 7. `OpenMouth`

- **Uso.** Boca aberta para fala (visemas simples) e ações de explicar.
- **Intensidade.** `0.2–0.5` fala normal (animar em loop); `1.0` boca bem aberta.
- **Combina com.** `Smile` (fala alegre), `Surprised` (espanto), `Thinking` leve.
- **Não combinar com.** —  (compatível com a maioria; cuidar de clipping em `1.0`).

---

## Combinações canônicas (referência rápida)

| Estado/expressão | Shape keys | Observação |
| --- | --- | --- |
| Happy / Celebrate | `Smile` + `OpenMouth` | riso aberto |
| Curious (leve) | `Thinking` + `Smile` leve | interesse simpático |
| Warning | `Sad` + `Thinking` | preocupação atenta |
| Speaking | `OpenMouth` (loop) + base | sincronizar com `Explaining`/`Idle` |
| Piscar | `Blink_L` + `Blink_R` | curva rápida, simétrica |

Combinações **proibidas** (resumo): `Smile`+`Sad`, `Surprised` alto + `Blink_*`
alto, `Surprised` alto + `Thinking` alto.

---

## Critérios de validação (resumo)

`validate_shape_keys.py` verifica:

- [ ] As **7 shape keys** canônicas existem (nomes exatos; D-009 tolerante).
- [ ] Há `Basis` e nenhuma **duplicata** (`Smile.001` etc.).
- [ ] Nomes seguem a convenção (`PascalCase` / `Snake_Case` para lados, ex. `Blink_L`).
