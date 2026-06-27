# `public/nathalia/` — assets runtime da Nathal.IA 3D

Esta pasta serve os modelos 3D da Nathal.IA por HTTP. O componente 3D
(`NathaliaCanvas` → `useGLTF`) carrega o `.glb` a partir de uma URL pública;
por padrão `/nathalia/master_preview.glb` (ver `NEXT_PUBLIC_NATHALIA_3D_MODEL_URL`).

## Importante

- Os binários `.glb` **não são versionados** (`.gitignore`: `*.glb`). Apenas este
  README e o `.gitkeep` ficam no Git.
- O arquivo é **derivado** de `packages/character-nathalia/assets/models/master_preview.glb`
  (fonte: `master.blend`, Fase 5). **Não edite aqui** — gere no Blender e
  sincronize.

## Como popular

Rode o sync a partir da raiz do repositório:

```bash
node scripts/nathalia/sync_runtime_model.mjs
```

Ele copia `packages/character-nathalia/assets/models/master_preview.glb` para
`apps/web/public/nathalia/master_preview.glb`.

> Em ambientes de build remotos (Vercel) o `.glb` precisa estar presente para o
> 3D funcionar. Como o flag `NEXT_PUBLIC_ENABLE_NATHALIA_3D` é `false` por padrão,
> a ausência do arquivo **não quebra** o app: o avatar 2D/CSS é usado. Para
> ativar 3D em produção, garanta o asset no build (sync no prebuild, commit via
> Git LFS ou storage/CDN apontado pela env var).

Ver `docs/nathalia/REACT_THREE_FIBER_INTEGRATION.md`.
