# `thumbnails/` — Thumbnails de revisão (intake)

Imagens leves geradas durante o intake para revisão humana rápida do candidato
(antes de decidir refinar/rejeitar). Não confundir com os thumbnails de fallback
2D de runtime, que vivem em `packages/character-nathalia/assets/thumbnails/`.

- Imagens (PNG/WebP) **não versionadas** por padrão (ADR-010 / D-004); mantenha
  só localmente até definirmos storage/LFS.
- Geração assistida (Fase 4+) via `generate_thumbnails.py` a partir do
  candidato.
