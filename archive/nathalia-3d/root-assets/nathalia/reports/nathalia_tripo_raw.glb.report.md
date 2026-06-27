# Relatório de intake — `nathalia_tripo_raw.glb`

> Gerado por `scripts/nathalia/generate_asset_report.py` (Fase 3A — Asset Intake & Technical Validation).
> Não-destrutivo; o arquivo de origem não foi modificado.

## Identificação

| Campo | Valor |
| --- | --- |
| Arquivo | `nathalia_tripo_raw.glb` |
| Caminho | `packages/character-nathalia/assets/raw/nathalia_tripo_raw.glb` |
| Origem | Tripo |
| Status | raw candidate |
| Data da análise | 2026-06-16 |
| Modo de análise | structural |
| Tamanho do arquivo | 54.5 MB |

## Métricas

| Métrica | Valor | Referência (contrato) |
| --- | --- | --- |
| Objetos | 1 | separáveis (corpo/cabelo/roupa…) |
| Meshes | 1 | — |
| Materiais | 1 | 7 nomeados esperados |
| Triângulos | — | mvp ≤ 25000, ideal ≤ 40000, máx 60000 |
| Vértices | — | — |
| Animações | 0 | nenhuma no bruto (rig vem no Blender) |
| Shape keys | 0 | 7 esperadas (Fase 4) |
| Texturas | 3 | evitar excesso; preferir atlas |

## Presença de recursos

- Possui rig/armature: **não**
- Possui animações: **não**
- Possui shape keys: **não**

### Listas

**Objetos** (1):

```
tripo_node_e928f8f7-2fe5-4103-a6b9-67de24984424
```

**Materiais** (1):

```
tripo_material_e928f8f7-2fe5-4103-a6b9-67de24984424
```

**Animações** (0):

- (nenhum)

**Shape keys** (0):

- (nenhum)

**Ossos do rig** (0):

- (nenhum)

## Problemas encontrados

**Avisos:**

- ⚠️ arquivo 54.5 MB acima do orçamento 1.5 MB (compressão/Draco na Fase 4)
- ⚠️ modelo parece ser um único objeto — dificulta separar partes (corpo/cabelo/roupa) para materiais e logo
- ⚠️ apenas 1 material — provável textura única; aplicar o logo jump e materiais nomeados exigirá retrabalho no Blender
- ⚠️ objects: faltando nomes esperados ['Body', 'Hair', 'Shirt', 'Pants', 'Shoes', 'Eyes', 'Logo'] (tolerante; reconciliar no Blender)
- ⚠️ materials: faltando nomes esperados ['MAT_Body', 'MAT_Hair', 'MAT_Shirt', 'MAT_Pants', 'MAT_Shoes', 'MAT_Eyes', 'MAT_Logo'] (tolerante; reconciliar no Blender)
- ⚠️ animations: faltando nomes esperados ['Idle', 'Wave', 'Thinking', 'Pointing', 'Explaining', 'Celebrate', 'Typing', 'Alert'] (tolerante; reconciliar no Blender)
- ⚠️ shapeKeys: faltando nomes esperados ['Smile', 'Blink_L', 'Blink_R', 'Thinking', 'Surprised', 'OpenMouth', 'Sad'] (tolerante; reconciliar no Blender)
- ⚠️ sem armature/rig — esperado num bruto do Tripo; rig vem no Blender

**Notas:**

- Modo estrutural: triângulos, vértices e dimensões exigem Blender.

## Decisão recomendada (automática)

> **aceitar apenas como referência visual**

Opções possíveis (a decisão final é humana, contra o [Character Bible](../../docs/nathalia/CHARACTER_BIBLE.md) e o [checklist de aceite](../../docs/nathalia/MASTER_GLB_ACCEPTANCE_CHECKLIST.md)):

- aceitar para refinamento
- aceitar apenas como referência visual
- rejeitar e gerar novo Tripo
- gerar novo Character Sheet antes de outro Tripo

> ⚠️ **Validação estrutural** (sem Blender): triângulos, vértices, dimensões e rig não foram medidos. Rode no Blender para um veredito completo:
> 
> `blender --background --python scripts/nathalia/validate_glb.py -- packages/character-nathalia/assets/raw/nathalia_tripo_raw.glb`

---

_Decisão final tomada por (preencher):_ ______  ·  _Data:_ ______
