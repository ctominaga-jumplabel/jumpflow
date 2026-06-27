# `raw/` — Candidatos crus

Modelos `.glb` exatamente como saíram do gerador (Tripo), **sem nenhuma edição**.

- **Nunca editar** um arquivo aqui — é a evidência do que o gerador produziu.
- Os binários **não são versionados** (ver `.gitignore` da raiz e ADR-010 /
  D-004). Baixe o `.glb` do Tripo e coloque-o aqui localmente.
- Cada candidato deve ser inspecionado/validado e ter sua decisão registrada em
  [`../../../docs/nathalia/ASSET_INTAKE_REPORT.md`](../../../docs/nathalia/ASSET_INTAKE_REPORT.md).

Validar um candidato:

```bash
python scripts/nathalia/inspect_glb.py assets/nathalia/raw/<arquivo>.glb
blender --background --python scripts/nathalia/validate_glb.py -- assets/nathalia/raw/<arquivo>.glb
python scripts/nathalia/generate_asset_report.py assets/nathalia/raw/<arquivo>.glb
```
