# Master V2 Validation & Comparison — Nathal.IA (Fase 7, Etapa 12)

> Relatório consolidado de validação e comparação do **`master_v2`** (Artistic
> Refinement Pass) contra o **`master`** (v1, Fase 5). Polimento do relatório
> bruto gerado por `report_master.py` sobre a cena viva — ver fonte em
> [`MASTER_V2_VALIDATION_RAW.md`](./MASTER_V2_VALIDATION_RAW.md).
>
> Hierarquia de canon: [`../CHARACTER_BIBLE.md`](../CHARACTER_BIBLE.md) vence; a
> [`../CHARACTER_SHEET_PREMIUM.md`](../CHARACTER_SHEET_PREMIUM.md) mede a direção
> visual; o [`../GLB_REQUIREMENTS.md`](../GLB_REQUIREMENTS.md) é o contrato
> técnico. Aceite formal: [`../MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](../MASTER_GLB_ACCEPTANCE_CHECKLIST.md)
> (ADR-010).
>
> Artefatos: `master_v2.blend`, `master_v2_preview.glb`, thumbnails em
> `assets/nathalia/thumbnails/v2/`. Construtor:
> `scripts/nathalia/blender/construct_master_v2.py`.
>
> Última atualização: **2026-06-17**.

---

## 1. Resumo

| Campo | Valor |
| --- | --- |
| Alvo | `master_v2.blend` (cena viva) |
| Modo | Blender 5.1 (`BLENDER_EEVEE`) |
| Contrato | Preservado (7 objetos, 7 materiais, 16 bones, pés no chão, ~1,6 m, faces -Y) |
| **Resultado final** | **PASS** (todas as seções) |

A v2 é um **passe de refino incremental** sobre a base modular paramétrica da v1
— **não** um resculpt. Mantém integralmente o contrato consumido pela validação
e pelo runtime R3F da Fase 6.

---

## 2. Verdictos de validação (cena viva)

Cada seção foi validada por `report_master.py` na cena construída. Detalhe bruto
em [`MASTER_V2_VALIDATION_RAW.md`](./MASTER_V2_VALIDATION_RAW.md).

### Objetos & Materiais — **PASS**

| Verificação | Status | Detalhe |
| --- | --- | --- |
| objetos | PASS | 7 ok |
| materiais | PASS | 7 ok |
| origem (pés no chão) | PASS | min Z ≈ 0 |
| escala (altura) | PASS | 1.584 m |

### Rig — **PASS**

| Verificação | Status | Detalhe |
| --- | --- | --- |
| armature | PASS | Armature |
| bones | PASS | 16 ok |
| hierarquia | PASS | pais conferem |

### Shape Keys — **PASS**

| Verificação | Status | Detalhe |
| --- | --- | --- |
| Basis | PASS | presente |
| shape keys | PASS | 10 ok |
| duplicatas | PASS | nenhuma |

### Actions — **PASS**

| Verificação | Status | Detalhe |
| --- | --- | --- |
| actions | PASS | 9 ok |
| Idle | PASS | 4.0s | 
| Wave | PASS | 1.5s |
| Thinking | PASS | 2.21s |
| Pointing | PASS | 1.5s |
| Explaining | PASS | 2.0s |
| Celebrate | PASS | 1.75s |
| Typing | PASS | 1.5s |
| Alert | PASS | 1.17s |
| Greeting | PASS | 1.58s |

> Nota: a v1 fechava as Actions em **WARNING** por ter só 3 dos 8 clipes
> previstos. A v2 entrega 9 clipes — **todos dentro das janelas de duração** do
> `master_character_config` — elevando a seção de WARNING para **PASS** e,
> com isso, o veredito consolidado de WARNING para **PASS**.

---

## 3. Comparação v1 → v2

| Métrica | v1 (`master`) | v2 (`master_v2`) | Δ |
| --- | --- | --- | --- |
| Objetos | 7 | 7 | = (contrato preservado) |
| Materiais `MAT_*` | 7 | 7 | = (contrato preservado) |
| Rig (bones) | 16 | 16 | = |
| Shape keys | 7 | **10** | +3 (Curious, Greeting, Celebrate) |
| Actions | 3 | **9** | +6 (Pointing, Explaining, Celebrate, Typing, Alert, Greeting) |
| Tamanho do preview | ~154 KB | ~260 KB | +~106 KB |
| Triângulos | ~8,5k | ~11k | +~2,5k |
| Altura | 1.569 m | 1.584 m | ≈ |
| Veredito consolidado | WARNING | **PASS** | ⬆ |

O crescimento de tris e de tamanho vem dos **detalhes faciais** (sobrancelhas,
íris, boca, nariz), do **cabelo mais cheio** (massa traseira, comprimento, mechas
laterais) e dos **detalhes de roupa** (gola, punhos, solado/biqueira do tênis).

---

## 4. Resumo de melhoria visual

Comparação dos thumbnails `assets/nathalia/thumbnails/` (v1) vs.
`assets/nathalia/thumbnails/v2/` (front, three_quarter, side, back):

- **Rosto.** v1 tinha rosto **em branco**; v2 tem sobrancelhas arqueadas,
  íris/pupila, linha de boca com cantos erguidos (micro-sorriso de repouso) e um
  plano sutil de nariz. **Maior ganho de empatia e leitura pequena.** Os detalhes
  são dobrados no mesh Body como segundo slot `MAT_Hair`, então deformam com as
  shape keys faciais — sem objeto/material extra.
- **Cabelo.** Massa traseira mais cheia + comprimento até o meio do tronco +
  coroa + franja assimétrica + duas mechas laterais por lado emoldurando o rosto.
  A silhueta — marcador nº 1 em tamanho pequeno — ficou nitidamente mais forte.
- **Roupa.** Anel de gola careca, mangas curtas com punho, tênis low-top com
  corpo + solado mais claro + biqueira arredondada, joelhos/tornozelos definidos
  na calça, e wordmark `jump` reescalado (0.055) e re-centrado. A figura lê como
  vestida, não como blocos chapados.
- **Materiais.** 7 `MAT_*` fixados em hex+roughness do canon; specular leve
  (~0.6) só nos olhos para o "brilho de vida". Laranja Jump **não** entrou como
  base — segue reservado a acessórios.

**Limitação conhecida (cosmética):** o render offline de 3 luzes deixa uma faixa
de ambient-occlusion sob o queixo nas thumbnails. **Não reproduz no runtime R3F**
(iluminação diferente). A estética permanece a de um avatar low-poly estilizado-
blocado — este passe é refino incremental, não o alvo Pixar/Notion completo. Gaps
plásticos remanescentes em [`../ARTISTIC_REVIEW.md`](../ARTISTIC_REVIEW.md).

---

## 5. Impacto técnico

- **Contrato intacto.** 7 objetos / 7 materiais / 16 bones / pés no chão / ~1,6 m
  / faces -Y — toda a validação e o runtime R3F da Fase 6 seguem compatíveis sem
  alteração de código.
- **Sem material novo.** Detalhes faciais reaproveitam `MAT_Hair`; mantém a
  contagem de 7 e a regra "sem material de marca laranja na base".
- **Não destrutivo com a v1.** O builder grava `master_v2.blend` /
  `master_v2_preview.glb` / `thumbnails/v2/*` — **nunca** sobrescreve os
  artefatos v1.
- **Export coerente.** GLB com animações + morph targets exportados (9 actions,
  10 shape keys), via NLA tracks com fake user para persistirem.

---

## 6. Impacto de performance

| Orçamento (MVP) | Limite | v2 | Folga |
| --- | --- | --- | --- |
| Tamanho de arquivo | ≤ 1,5 MB | ~260 KB | **~83% de folga** |
| Triângulos | ≤ 25k | ~11k | **~56% de folga** |

- Continua **muito abaixo** do orçamento web (≤ 1,5 MB / 25k tris). O salto de
  ~154 KB→~260 KB e ~8,5k→~11k tris é confortável.
- **Acessórios não pesam o base:** são GLBs pequenos separados, carregados sob
  demanda (ver [`../ACCESSORIES.md`](../ACCESSORIES.md) e
  [`../ACCESSORY_PIPELINE.md`](../ACCESSORY_PIPELINE.md)).
- A stack `three` segue isolada e lazy (fora do bundle inicial), com fallback 2D
  garantido e respeito a reduced motion — sem regressão da Fase 6.

---

## 7. Veredito

**PASS consolidado.** O `master_v2` melhora claramente empatia (rosto),
reconhecimento (silhueta) e repertório (10 shape keys, 9 actions) sem quebrar o
contrato técnico nem estourar o orçamento de performance, e **promove o veredito
de Actions de WARNING para PASS**. Os gaps que restam são de **plástica
escultural** (forma blocada, junções de ombro, rosto esquemático), documentados e
priorizados em [`../ARTISTIC_REVIEW.md`](../ARTISTIC_REVIEW.md). A direção de arte
durável está em [`../ART_DIRECTION_GUIDE.md`](../ART_DIRECTION_GUIDE.md).

> Fonte bruta: [`MASTER_V2_VALIDATION_RAW.md`](./MASTER_V2_VALIDATION_RAW.md) ·
> Aceite formal de promoção a runtime: [`../MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](../MASTER_GLB_ACCEPTANCE_CHECKLIST.md) (ADR-010).
