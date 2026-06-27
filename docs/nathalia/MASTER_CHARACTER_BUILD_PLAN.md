# Nathal.IA — Master Character Build Plan

> **Plano mestre de produção do `master.glb`** (Fase 4). Descreve, etapa a etapa,
> como transformar a **referência visual aprovada** (`nathalia_tripo_v02.glb`) no
> artefato canônico game-ready da Nathal.IA.
>
> Este documento é o **roteiro operacional**; o **contrato técnico** vive em
> [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md) e a **planta de montagem** em
> [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md). A automação está em
> [`scripts/nathalia/blender/`](../../scripts/nathalia/blender/README.md).
>
> A v02 é **referência de forma** (likeness/silhueta), **não** geometria final
> (ver [`CURRENT_STATE.md`](./CURRENT_STATE.md) e D-003). O `master.glb` ainda
> **não** foi gerado — a Fase 4 entrega a **fábrica**; a Fase 5 roda a produção.
>
> Última atualização: **2026-06-16**.

---

## Visão geral do pipeline

```
ETAPA 1  Importar referência (v02)
   ↓
ETAPA 2  Reconstrução game-ready (retopo, UVs)
   ↓
ETAPA 3  Separação de objetos (Body/Hair/Eyes/Shirt/Pants/Shoes/Logo)
   ↓
ETAPA 4  Materiais (MAT_*)
   ↓
ETAPA 5  Rig (Armature + skinning)
   ↓
ETAPA 6  Shape Keys (expressões)
   ↓
ETAPA 7  Actions (clipes de animação)
   ↓
ETAPA 8  Validação (objetos, rig, shape keys, actions, polycount)
   ↓
ETAPA 9  Export master.glb (+ normalização + preview)
```

Cada etapa tem **entrada**, **saída** e **critério de pronto (DoD)**. O
orquestrador [`build_master.py`](../../scripts/nathalia/blender/build_master.py)
encadeia as validações e o export; nesta fase ele roda como **estrutura
preparada** (não gera `master.glb` real).

---

## Etapa 1 — Importação da referência visual

**Objetivo.** Trazer a v02 para o Blender como **guia de forma**, sem adotá-la
como geometria final.

- Importar `packages/character-nathalia/assets/raw/nathalia_tripo_v02.glb`.
- Travar em uma coleção `REF` (não exportável, oculta no final).
- Conferir proporções contra [`CHARACTER_SHEET_PREMIUM.md`](./CHARACTER_SHEET_PREMIUM.md).

**Entrada.** `nathalia_tripo_v02.glb` (≈57 MB, blob único, sem rig).
**Saída.** Cena com a referência travada em `REF`.
**DoD.** Referência visível, escalada ~1,60 m, centralizada na origem.

---

## Etapa 2 — Reconstrução game-ready

**Objetivo.** Topologia limpa e leve, dentro do orçamento de polígonos.

- **Retopo** sobre a v02 (shrinkwrap/manual) com loops limpos no rosto
  (boca, pálpebras, sobrancelhas) para suportar as shape keys da Etapa 6.
- **UVs** sem sobreposição; preferir **atlas único** (1024²).
- Maiores consumidores de polígono: **cabelo** e **tênis** — simplificar primeiro.

**Entrada.** Referência travada.
**Saída.** Malha game-ready dentro do orçamento.
**DoD.** ≤ 40.000 triângulos (ideal), ≤ 60.000 (máximo); UVs íntegros.

---

## Etapa 3 — Separação de objetos

**Objetivo.** Quebrar o blob único em **7 objetos nomeados**.

| Objeto | Conteúdo |
| --- | --- |
| `Body` | corpo + cabeça + pescoço + braços + mãos |
| `Hair` | cabelo |
| `Eyes` | olhos |
| `Shirt` | camiseta (área reservada no peito p/ logo) |
| `Pants` | calça |
| `Shoes` | tênis |
| `Logo` | wordmark `jump` (decal/plano no peito) |

- **Nomes exatos** (sem sufixos `.001`); root da personagem = `Nathalia`.

**Entrada.** Malha game-ready.
**Saída.** 7 objetos sob o root `Nathalia`.
**DoD.** `validate_master.py` lista exatamente os 7 objetos esperados.

---

## Etapa 4 — Materiais

**Objetivo.** Aplicar os **7 materiais nomeados** (`MAT_*`).

- `MAT_Body`, `MAT_Hair`, `MAT_Eyes`, `MAT_Shirt`, `MAT_Pants`, `MAT_Shoes`,
  `MAT_Logo` — cores/roughness em [`MASTER_GLB_BLUEPRINT.md`](./MASTER_GLB_BLUEPRINT.md) §4.
- Sem metais, sem emissão. Wordmark `jump` legível em branco no `MAT_Logo`.

**Entrada.** 7 objetos.
**Saída.** 7 materiais ligados 1:1 aos objetos.
**DoD.** `validate_master.py` confirma os 7 materiais; logo legível.

---

## Etapa 5 — Rig

**Objetivo.** Esqueleto humanoide mínimo + skinning suave.

- `Armature` com os bones de [`RIG_BLUEPRINT.md`](./RIG_BLUEPRINT.md)
  (Pelvis → Spine → Neck → Head; braços e pernas `.L`/`.R`).
- Bind pose = **A-Pose leve** (braços ~30°), pés paralelos na origem.
- Sem bones de dedos no MVP.

**Entrada.** Objetos + materiais.
**Saída.** Malhas skinned ao `Armature`.
**DoD.** `validate_rig.py` confirma bones e hierarquia.

---

## Etapa 6 — Shape Keys

**Objetivo.** Expressões faciais combináveis.

- **7 shape keys**: `Smile`, `Blink_L`, `Blink_R`, `Thinking`, `Surprised`,
  `Sad`, `OpenMouth` — ver [`SHAPE_KEYS_BLUEPRINT.md`](./SHAPE_KEYS_BLUEPRINT.md)
  e o mapeamento expressão→shape key em [`EXPRESSIONS.md`](./EXPRESSIONS.md).
- Todas neutras em 0; não devem quebrar a malha em 1.0.

**Entrada.** Rig + face com loops limpos.
**Saída.** 7 shape keys no `Body`/`Eyes`.
**DoD.** `validate_shape_keys.py` confirma nomes e ausência de duplicatas.

---

## Etapa 7 — Actions

**Objetivo.** Clipes de animação corporais canônicos.

- **8 Actions**: `Idle`, `Wave`, `Thinking`, `Pointing`, `Explaining`,
  `Celebrate`, `Typing`, `Alert` — ver [`ACTIONS_BLUEPRINT.md`](./ACTIONS_BLUEPRINT.md)
  e [`GESTURES.md`](./GESTURES.md).
- Cada Action começa e termina perto da pose neutra (blend suave).

**Entrada.** Rig + shape keys.
**Saída.** 8 Actions nomeadas.
**DoD.** `validate_actions.py` confirma nomes, duração e loop.

---

## Etapa 8 — Validação

**Objetivo.** Aprovar tecnicamente antes de exportar.

Rodar os validadores (independentes) e o relatório consolidado:

```bash
blender --background --python scripts/nathalia/blender/validate_master.py
blender --background --python scripts/nathalia/blender/validate_rig.py
blender --background --python scripts/nathalia/blender/validate_shape_keys.py
blender --background --python scripts/nathalia/blender/validate_actions.py
blender --background --python scripts/nathalia/blender/report_master.py
```

**Saída.** Relatório em `docs/nathalia/reports/` (modelo em
[`reports/MASTER_VALIDATION_TEMPLATE.md`](./reports/MASTER_VALIDATION_TEMPLATE.md)).
**DoD.** Resultado **PASS** (ou WARNING justificado) em todos os validadores.

---

## Etapa 9 — Export master.glb

**Objetivo.** Produzir o artefato canônico.

- Normalizar escala/origem/orientação (`normalize_master.py --apply`).
- Exportar com [`export_master_glb.py`](../../scripts/nathalia/blender/export_master_glb.py)
  (glTF 2.0 binário, texturas embutidas, Draco, sem câmeras/luzes).
- Gerar previews 2D com [`export_preview_images.py`](../../scripts/nathalia/blender/export_preview_images.py).
- Rodar `validate_glb.py` no resultado e cumprir o
  [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](./MASTER_GLB_ACCEPTANCE_CHECKLIST.md)
  (ADR-010) antes de promover a `master.glb`.

**Saída.** `master.glb` ≤ ~1,5 MB, validado e promovido.
**DoD.** Aprovado no checklist de aceite e em `validate_glb.py`.

---

## Estado nesta fase

A Fase 4 entrega **toda a infraestrutura** (este plano, blueprints, config,
scripts/validadores). **Nenhum `master.glb` real é gerado aqui** — a produção
(Etapas 1–9 executadas no Blender) acontece na **Fase 5**, ver
[`NEXT_PHASES.md`](./NEXT_PHASES.md).
