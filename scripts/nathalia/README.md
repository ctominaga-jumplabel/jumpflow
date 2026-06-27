# Nathal.IA — Scripts de Pipeline 3D

Esteira de automação para gerar, validar e derivar os ativos 3D da Nathal.IA.
O **`master.glb` é a fonte de verdade**; estes scripts o validam e produzem
artefatos derivados a partir dele.

> **Fase 3A:** `inspect_glb.py`, `validate_glb.py` e `generate_asset_report.py`
> já operam sobre `.glb` reais (Blender ou parsing estrutural). Os demais
> (`normalize_master.py`, `export_variants.py`, `generate_thumbnails.py`)
> continuam **stubs seguros** até a Fase 4. Nada altera arquivos sem `--apply`,
> e tudo degrada de forma amigável sem Blender / sem `.glb`.

Documentação relacionada:

- [`docs/nathalia/THREE_D_PIPELINE.md`](../../docs/nathalia/THREE_D_PIPELINE.md) — pipeline ponta a ponta.
- [`docs/nathalia/BLENDER_AUTOMATION.md`](../../docs/nathalia/BLENDER_AUTOMATION.md) — como rodar via Blender.
- [`docs/nathalia/GLB_REQUIREMENTS.md`](../../docs/nathalia/GLB_REQUIREMENTS.md) — contrato técnico.
- [`docs/nathalia/DECISIONS.md`](../../docs/nathalia/DECISIONS.md) — decisões.

## Arquivos

| Arquivo | Papel | Altera arquivo? |
| --- | --- | --- |
| `nathalia_assets.config.json` | **Contrato único**: caminhos (inclui `intake.*`), estados, animações, materiais, objetos, rig, shape keys, polycount, limites de textura, variantes | — |
| `glb_metrics.py` | **Módulo compartilhado**: mede (`collect_metrics`) e julga (`evaluate`) um `.glb`. Usado por validate/inspect/report — fonte única das métricas | ❌ Não |
| `validate_glb.py` | Valida o `.glb` contra o contrato; relatório tolerante; só reprova em violação dura | ❌ Não |
| `inspect_glb.py` | Descreve o conteúdo do `.glb` (Blender ou parsing estrutural) | ❌ Não |
| `generate_asset_report.py` | Gera relatório markdown de intake em `assets/nathalia/reports/<arquivo>.report.md` | Escreve `.report.md` |
| `export_variants.py` | (futuro) Deriva LODs/recortes a partir do `master.glb` | Escreve derivados |
| `normalize_master.py` | Stubs de escala/origem/orientação/nomes; só altera com `--apply` | Só com confirmação |
| `generate_thumbnails.py` | (futuro) Renderiza thumbnails 2D de fallback | Escreve PNGs |

## Como rodar

A maioria precisa do **Blender** (Python `bpy` embutido). Note o `--` separando
os argumentos do Blender dos argumentos do script:

```bash
# Validar (tolerante; --strict reprova com warnings)
blender --background --python scripts/nathalia/validate_glb.py -- assets/nathalia/master.glb

# Inspecionar (também roda fora do Blender, em modo estrutural)
python scripts/nathalia/inspect_glb.py assets/nathalia/master.glb

# Normalizar (dry-run por padrão; --apply para efetivar, exige Blender)
blender --background --python scripts/nathalia/normalize_master.py -- assets/nathalia/master.glb --apply

# Exportar variantes (futuro)
blender --background --python scripts/nathalia/export_variants.py -- assets/nathalia/master.glb

# Gerar thumbnails (futuro)
blender --background --python scripts/nathalia/generate_thumbnails.py -- assets/nathalia/master.glb
```

Sem o `master.glb` (caso atual), os scripts imprimem o plano e saem de forma
controlada.

## Princípios

- **Contrato único:** limites e nomes vêm de `nathalia_assets.config.json` —
  não duplicar valores nos scripts.
- **Tolerância:** divergências de nome são reportadas, não fatais (D-009).
- **Não destrutivo por padrão:** alterações exigem `--apply`.
- **Seguro fora do Blender:** detecta ausência de `bpy` e degrada.
- **Sem binários no Git:** ver [`DECISIONS.md`](../../docs/nathalia/DECISIONS.md) D-004.
