# Arquivo — Nathal.IA 3D (descontinuado)

A abordagem **3D** da Nathal.IA (three.js / React Three Fiber / Blender / GLBs) foi
**descontinuada em 2026-06** em favor de um produto **2D animado** (avatar de expressões
ilustradas + visemas). Veja `docs/nathalia/TECHNICAL_ARCHITECTURE.md` e
`docs/nathalia/ROADMAP.md`.

Nada aqui é usado em runtime ou no build. Os arquivos foram **movidos, não apagados**, caso
seja preciso retomar arte vetorial/3D no futuro.

## Conteúdo

- `package-assets/character-nathalia-assets/` — antigo `packages/character-nathalia/assets/`
  (`.blend` master/v2/v3, `.glb` de preview e acessórios, GLBs raw do Tripo, texturas, thumbnails).
- `public/accessories/` — GLBs de acessórios servidos em `/nathalia/accessories/*` (só o antigo
  `NathaliaModel` R3F os carregava).
- `root-assets/nathalia/` — antigo `assets/nathalia/` (relatórios de GLB, thumbnails de render 3D).
- `scripts/` — pipeline Blender (`blender/`) e scripts de GLB/captura 3D
  (`*_glb.py`, `inspect_glb.py`, `normalize_master.py`, `capture_3d_demo.mjs`, `capture_canvas.mjs`,
  `capture_rig.mjs`, `sync_runtime_model.mjs`, `export_variants.py`).

## Código removido do pacote (recuperável via histórico git)

`NathaliaCanvas.tsx`, `NathaliaModel.tsx`, `NathaliaAvatar3DLazy.tsx`, `nathalia3D.ts`,
`NathaliaErrorBoundary.tsx`, além das dependências `three` / `@react-three/fiber` /
`@react-three/drei` / `@types/three`.

> Os docs 3D em `docs/nathalia/` (ex.: `THREE_D_PIPELINE.md`, `REACT_THREE_FIBER_INTEGRATION.md`,
> `MASTER_CHARACTER_RELEASE.md`, `V03_TRIPO_EVALUATION.md`) permanecem no lugar como registro
> histórico; tratam-se de material descontinuado.
