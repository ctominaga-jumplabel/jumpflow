# Nathal.IA — Blender Master Character Pipeline (Fase 4)

Fábrica do **`master.glb`** da Nathal.IA. Estes scripts orquestram a construção
no Blender, validam o resultado e exportam o artefato canônico.

> **Fase 4 = estrutura preparada.** Os validadores e o orquestrador já rodam
> (no Blender, contra a cena/`.glb`; fora do Blender, exibindo o contrato), mas
> **nenhum `master.glb` real é gerado aqui**. A produção (importar a v02,
> retopo, split, rig, shape keys, actions, export) acontece na **Fase 5**.
>
> O `master.glb` é a **fonte única de verdade visual** (D-001); tudo deriva dele.

## Documentação relacionada

- [`docs/nathalia/MASTER_CHARACTER_BUILD_PLAN.md`](../../../docs/nathalia/MASTER_CHARACTER_BUILD_PLAN.md) — roteiro das 9 etapas.
- [`docs/nathalia/MASTER_GLB_BLUEPRINT.md`](../../../docs/nathalia/MASTER_GLB_BLUEPRINT.md) — planta de montagem.
- [`docs/nathalia/RIG_BLUEPRINT.md`](../../../docs/nathalia/RIG_BLUEPRINT.md) — esqueleto.
- [`docs/nathalia/SHAPE_KEYS_BLUEPRINT.md`](../../../docs/nathalia/SHAPE_KEYS_BLUEPRINT.md) — expressões.
- [`docs/nathalia/ACTIONS_BLUEPRINT.md`](../../../docs/nathalia/ACTIONS_BLUEPRINT.md) — clipes.
- [`docs/nathalia/ACCESSORY_PIPELINE.md`](../../../docs/nathalia/ACCESSORY_PIPELINE.md) — acessórios.
- [`docs/nathalia/GLB_REQUIREMENTS.md`](../../../docs/nathalia/GLB_REQUIREMENTS.md) — contrato técnico.
- [`docs/nathalia/reports/MASTER_VALIDATION_TEMPLATE.md`](../../../docs/nathalia/reports/MASTER_VALIDATION_TEMPLATE.md) — modelo de relatório.

## Arquivos

| Arquivo | Papel | Escreve? |
| --- | --- | --- |
| `master_character_config.json` | **Contrato de build**: objetos, materiais, bones, shape keys, actions, limites, transform, export. Espelha `../nathalia_assets.config.json` | — |
| `pipeline_common.py` | **Módulo compartilhado**: carrega config, parse CLI, detecta Blender, formata relatórios (`Report`). Análogo a `../glb_metrics.py` | ❌ Não |
| `build_master.py` | **Orquestrador** das 9 etapas (importar→...→export). Encadeia validação + report | Só com `--export` + Blender |
| `validate_master.py` | Valida objetos, materiais, origem/escala/orientação | ❌ Não |
| `validate_rig.py` | Valida Armature, nomes de bones e hierarquia | ❌ Não |
| `validate_shape_keys.py` | Valida existência, nomes e duplicidade de shape keys | ❌ Não |
| `validate_actions.py` | Valida existência, duração e nomenclatura das actions | ❌ Não |
| `report_master.py` | Roda os 4 validadores e consolida PASS/WARNING/FAIL; `--write` gera `.md` | Só com `--write` |
| `export_master_glb.py` | Exporta `master.glb` (glTF 2.0/Draco); só com `--apply` | Só com `--apply` |
| `export_preview_images.py` | Renderiza previews 2D (turnaround/closeup); só com `--apply` | Só com `--apply` |

## Como rodar

A maioria precisa do **Blender** (Python `bpy` embutido). Note o `--` separando
os argumentos do Blender dos argumentos do script:

```bash
# Plano completo (validação + report) na cena/.blend aberta
blender --background --python scripts/nathalia/blender/build_master.py

# Validadores individuais (cena ativa ou um .glb)
blender --background --python scripts/nathalia/blender/validate_master.py
blender --background --python scripts/nathalia/blender/validate_rig.py -- master.glb
blender --background --python scripts/nathalia/blender/validate_shape_keys.py
blender --background --python scripts/nathalia/blender/validate_actions.py

# Relatório consolidado (e gravar markdown)
blender --background --python scripts/nathalia/blender/report_master.py -- --write

# Export (dry-run por padrão; --apply escreve o .glb, exige Blender + cena)
blender --background --python scripts/nathalia/blender/export_master_glb.py -- --apply
blender --background --python scripts/nathalia/blender/export_preview_images.py -- --apply
```

Sem o Blender (ou sem cena), os scripts imprimem o contrato/plano e saem de
forma controlada (sem erro) — nunca passam em silêncio.

## Princípios

- **Contrato único:** nomes/limites vêm de `master_character_config.json`, que
  **espelha** `../nathalia_assets.config.json` — não duplicar valores nos scripts.
- **Tolerância (D-009):** divergências de nome são WARNING, não FAIL; só
  violações duras (import inválido) reprovam.
- **Não destrutivo por padrão:** export/render só com `--apply`; report só grava
  com `--write`.
- **Seguro fora do Blender:** detecta ausência de `bpy` e degrada exibindo o plano.
- **Sem binários no Git:** ver [`DECISIONS.md`](../../../docs/nathalia/DECISIONS.md) D-004.
