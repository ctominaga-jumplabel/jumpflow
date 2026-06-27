# `reports/` — Relatórios de validação

Relatórios gerados por
[`scripts/nathalia/generate_asset_report.py`](../../../scripts/nathalia/generate_asset_report.py),
um por arquivo analisado: `<nome-do-arquivo>.report.md`.

Diferente dos binários, **os relatórios em markdown SÃO versionados** — eles são
o registro auditável do que foi medido em cada candidato e da decisão tomada.

```bash
python scripts/nathalia/generate_asset_report.py assets/nathalia/raw/<arquivo>.glb
# -> assets/nathalia/reports/<arquivo>.report.md
```

O sumário de cada análise também é consolidado em
[`../../../docs/nathalia/ASSET_INTAKE_REPORT.md`](../../../docs/nathalia/ASSET_INTAKE_REPORT.md).
