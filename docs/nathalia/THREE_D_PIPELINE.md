# Nathal.IA — Pipeline 3D

> Como a Nathal.IA sai do conceito até virar um modelo 3D integrável. O
> **`master.glb` é a fonte de verdade** da personagem; tudo a montante existe
> para produzi-lo e tudo a jusante o consome.

## Visão geral

```text
CHARACTER_BIBLE.md            (personalidade + direção visual — canônico)
        │
        ▼
CHARACTER_SHEET_SPEC.md       (folha de personagem premium: vistas, expressões)
        │
        ▼
Character Sheet visual        (imagens de referência — Fase 3)
        │
        ▼
Geração base no Tripo          (ou similar) ── prompt derivado da sheet
        │
        ▼
nathalia_base.glb             (modelo bruto, sem rig confiável)
        │
        ▼
Refinamento no Blender         (retopo leve, materiais, nomes, UVs)
        │
        ├─ rig (esqueleto humanoide — ver GLB_REQUIREMENTS.md §6)
        ├─ shape keys (expressões — §7)
        └─ actions (clipes de animação — §8)
        │
        ▼
master.glb                    ★ FONTE DE VERDADE ★
        │
        ▼
Validação automática           (scripts/nathalia/validate_glb.py via Blender)
        │
        ▼
Integração React Three Fiber   (Fase 5 — substitui fallback 2D progressivamente)
```

## Etapas

### 1. Character Bible → Character Sheet

Personalidade e direção visual já estão fechadas no
[`CHARACTER_BIBLE.md`](./CHARACTER_BIBLE.md). A
[`CHARACTER_SHEET_SPEC.md`](./CHARACTER_SHEET_SPEC.md) define **quais imagens**
produzir (turnaround, closes, expressões, pose-base).

### 2. Geração base (Tripo)

- **Ferramenta:** Tripo (ou equivalente image-to-3D / text-to-3D).
- **Entrada:** imagem hero + prompt derivado da sheet.
- **Saída:** `nathalia_base.glb` — geometria aproximada da personagem.
- **Escopo do Tripo:** **apenas o modelo base**. Não confiamos no Tripo para
  rig, shape keys, materiais nomeados ou topologia limpa (ver
  [`DECISIONS.md`](./DECISIONS.md)).

### 3. Refinamento (Blender)

O Blender é a **fábrica de ativos** (ver [`BLENDER_AUTOMATION.md`](./BLENDER_AUTOMATION.md)):

- Retopologia leve para caber no orçamento de polígonos.
- Renomear objetos e materiais para o padrão (`MAT_*`, `Body`, `Hair`, ...).
- UVs e texturas dentro dos limites.
- **Rig** humanoide simples.
- **Shape keys** das expressões.
- **Actions** (Idle, Wave, Thinking, ...).
- Normalização de escala/origem/orientação.

### 4. Export `master.glb`

Exportar glTF 2.0 binário conforme [`GLB_REQUIREMENTS.md`](./GLB_REQUIREMENTS.md).
Este é o artefato canônico.

### 5. Validação automática

```bash
blender --background --python scripts/nathalia/validate_glb.py -- assets/nathalia/master.glb
```

A validação (tolerante) confere objetos, materiais, animações, shape keys,
escala e polycount, e imprime um relatório. **Não altera o arquivo.**

### 6. Integração (React Three Fiber)

Na Fase 5, `canRender3D()` passa a retornar `true` quando houver `master.glb` +
WebGL, e um `NathaliaModel.tsx` (carregado via `dynamic({ ssr:false })`) toca o
clipe do estado atual. O avatar 2D/CSS permanece como **fallback**.

## Onde o `master.glb` vive

Slot esperado: `packages/character-nathalia/assets/models/` (ou `assets/nathalia/`
quando rodando scripts a partir da raiz). **Binários pesados não são versionados
nesta fase** — preferir Git LFS ou storage (ver `assets/models/README.md` e
[`DECISIONS.md`](./DECISIONS.md)).

## Princípios

- **Uma fonte de verdade:** o `master.glb`. Variantes (LODs, poses isoladas,
  thumbnails) são **derivadas** dele, nunca editadas à mão (ver `export_variants.py`).
- **Tripo só para a base.** Tudo que exige controle (rig, nomes, orçamento) é Blender.
- **Validação antes de integrar.** Nada entra no app sem passar por `validate_glb.py`.
- **Sem regressão do fallback 2D.** O 2D/CSS continua funcionando até o 3D estar pronto.
