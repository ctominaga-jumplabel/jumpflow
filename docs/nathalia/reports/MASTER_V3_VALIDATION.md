# Master V3 Validation — Nathal.IA `master_v3`

> Validação do `master_v3.blend` / `master_v3_preview.glb` (Fase 8.3), gerado por
> `scripts/nathalia/blender/refine_master_v3.py -- --apply` (Blender 5.1.2).
> Relatório bruto da cena viva: [`MASTER_V3_VALIDATION_RAW.md`](./MASTER_V3_VALIDATION_RAW.md).
>
> Data: **2026-06-17**.

## Resumo

| Campo | Valor |
| --- | --- |
| Alvo | `master_v3.blend` (cena viva) + `master_v3_preview.glb` |
| Modo | Blender 5.1.2 (`--background`) |
| Origem | refinamento incremental de `master_v2.blend` (não-destrutivo) |
| Tamanho do GLB | **260 KB** (≈ orçamento ideal 1 MB / teto 1.5 MB) ✅ |
| Polycount | ~11.3k tris (inalterado vs V2 — só recolor + escala) ✅ |
| **Resultado final** | **PASS** ✅ |

## Validadores

### Objetos & Materiais (`validate_master.py`) — **PASS**

| Verificação | Status | Detalhe |
| --- | --- | --- |
| objetos | PASS | 7 ok (`Body, Hair, Eyes, Shirt, Pants, Shoes, Logo`) |
| materiais | PASS | 7 ok (`MAT_*`) |
| origem (pés no chão) | PASS | min Z ≈ 0 |
| escala (altura) | PASS | 1.593 m (alvo ~1.6 m) |

### Rig (`validate_rig.py`) — **PASS**

| Verificação | Status | Detalhe |
| --- | --- | --- |
| armature | PASS | `Armature` |
| bones | PASS | 16 ok |
| hierarquia | PASS | pais conferem |

### Shape Keys (`validate_shape_keys.py`) — **PASS**

| Verificação | Status | Detalhe |
| --- | --- | --- |
| Basis | PASS | presente |
| shape keys | PASS | 10 ok (`Smile, Blink_L/R, Thinking, Surprised, Sad, OpenMouth, Curious, Greeting, Celebrate`) |
| duplicatas | PASS | nenhuma |

### Actions (`validate_actions.py`) — **PASS**

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

## Contrato preservado

Como o V3 só **recolore materiais** e **escala as malhas sem shape keys**
(`Eyes`, `Hair`, `Logo`), nenhum item do contrato técnico mudou:

- 7 objetos / 7 materiais (contagens exatas).
- 16 bones + hierarquia idêntica.
- 10 shape keys (Body intacto).
- 9 actions dentro das janelas de duração do `master_character_config.json`.
- ≈1.6 m, pés no chão, frente -Y; orçamento web respeitado.

## Notas

- Avisos do exportador glTF (`Mesh ... is not valid`, `>4 joint influences`) são
  **pré-existentes** e idênticos ao V2 — vêm da geometria de primitivas unidas e do
  auto-weight; não afetam validação nem runtime (export concluído OK).
- O `Icosphere` cosmético só aparece ao **re-importar** o GLB no Blender (artefato
  do importador, documentado), não está no `.blend` nem é exportado.

## Veredito

**PASS** — `master_v3` está apto a ser promovido como modelo de runtime padrão,
mantendo `master_v2_preview.glb` como fallback e o avatar 2D como fallback principal
(ver [`V2_VS_V3_COMPARISON.md`](../V2_VS_V3_COMPARISON.md)).
Aceite formal: [`../MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](../MASTER_GLB_ACCEPTANCE_CHECKLIST.md) (ADR-010).
