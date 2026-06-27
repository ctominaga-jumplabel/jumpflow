# Nathal.IA — Modelos 3D (.glb)

Esta pasta guarda o **export de runtime** da Nathal.IA. Desde a Fase 5 existe o
`master_preview.glb` (derivado de `../blender/master.blend`), e desde a Fase 6 ele
é consumido pelo avatar 3D (R3F) — ver
[`docs/nathalia/REACT_THREE_FIBER_INTEGRATION.md`](../../../../docs/nathalia/REACT_THREE_FIBER_INTEGRATION.md).

> Os `.glb` **não são versionados** (`.gitignore`: `*.glb`). Use Git LFS, um
> bucket de storage ou o sync script para popular o runtime
> (ver `docs/nathalia/ASSET_GUIDE.md`).

## Runtime (Fase 6)

- O componente 3D carrega o GLB por **URL HTTP**, não a partir desta pasta.
- O arquivo servido fica em `apps/web/public/nathalia/master_preview.glb`
  (URL `/nathalia/master_preview.glb`, configurável via
  `NEXT_PUBLIC_NATHALIA_3D_MODEL_URL`).
- Para sincronizar este `master_preview.glb` → `public/nathalia/`:

  ```bash
  node scripts/nathalia/sync_runtime_model.mjs
  ```

- Clipes presentes no preview MVP: `Idle`, `Wave`, `Thinking`. Shape keys do
  `Body_mesh`: `Smile, Blink_L, Blink_R, Thinking, Surprised, Sad, OpenMouth`.

## Slots futuros (rig por pose, se necessário)

## Arquivos esperados

| Arquivo                          | Pose / clip   | Estados que usam            |
| -------------------------------- | ------------- | --------------------------- |
| `nathalia-idle.glb`              | Idle          | idle, listening             |
| `nathalia-wave.glb`              | Wave          | welcome                     |
| `nathalia-thinking.glb`          | Thinking      | thinking, searching         |
| `nathalia-pointing.glb`          | Point/Explain | explaining, pointing        |
| `nathalia-happy.glb`             | Happy         | happy, success              |
| `nathalia-warning.glb`           | Warn/Shrug    | warning, error              |
| `nathalia-celebrate.glb`         | Celebrate     | celebrate                   |

A relação pose → estado é definida em `src/nathaliaStates.ts` (campo `pose`) e os
clipes de animação em `src/nathaliaAnimations.ts` (campo `clip`).

## Convenção de nomes

- minúsculas, kebab-case, prefixo `nathalia-`.
- um arquivo por pose **ou** um único rig (`nathalia.glb`) com clipes nomeados
  (`Idle`, `Wave`, `Thinking`, `Point`, `Happy`, `Warn`, `Celebrate`).

## Como está conectado (Fase 6 ✅)

A ligação descrita abaixo **já existe**:

1. Renderizador WebGL: `@react-three/fiber` + `@react-three/drei` + `three`.
2. `src/NathaliaModel.tsx` carrega o `.glb` com `useGLTF` e toca o clipe do
   estado atual (`stateToClip`), aplicando shape keys de repouso.
3. `src/NathaliaCanvas.tsx` monta o `<Canvas>`; é carregado via
   `next/dynamic(() => import("./NathaliaCanvas"), { ssr:false })` em
   `NathaliaAvatar3DLazy`.
4. `NathaliaAvatar` (híbrido) escolhe 2D vs 3D por `shouldAttempt3D`
   (flag `NEXT_PUBLIC_ENABLE_NATHALIA_3D` + WebGL + reduced motion), mantendo o
   avatar 2D como fallback permanente.

Para trocar o modelo, substitua o `.glb` servido em `public/nathalia/` (ou aponte
`NEXT_PUBLIC_NATHALIA_3D_MODEL_URL` para um storage/CDN) — **a API React não muda**.
