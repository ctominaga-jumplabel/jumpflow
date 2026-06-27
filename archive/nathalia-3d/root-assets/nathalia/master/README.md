# `master/` — Candidatos a master (pré-promoção)

`master.glb` normalizado e refinado, **antes** de ser promovido ao pacote de
runtime (`packages/character-nathalia/assets/models/master.glb`).

- Um arquivo só é promovido após passar **todos** os critérios de
  [`MASTER_GLB_ACCEPTANCE_CHECKLIST.md`](../../../docs/nathalia/MASTER_GLB_ACCEPTANCE_CHECKLIST.md)
  e na validação `validate_glb.py` (idealmente `--strict`).
- Binários **não versionados** (ADR-010 / D-004).
- O `master.glb` é a fonte única de verdade visual (D-001); variantes/LODs são
  derivadas dele, nunca editadas à mão.
