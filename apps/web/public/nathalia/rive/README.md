# Nathal.IA — Rive runtime asset

Coloque aqui o arquivo **`nathalia.riv`** autorado no editor do Rive (rive.app).

- Servido em runtime como `/nathalia/rive/nathalia.riv` (constante `NATHALIA_RIVE_SRC`).
- O contrato (artboard, state machine, inputs e ordenações) está em
  [`docs/nathalia/RIVE_SPEC.md`](../../../../docs/nathalia/RIVE_SPEC.md).
- Enquanto o `.riv` não existir, a flag `NEXT_PUBLIC_NATHALIA_RIVE=true` apenas
  cai no avatar 2D (o runtime reporta erro de carga e renderizamos o fallback).

> Este arquivo `.riv` **não** é gerado por código — é arte/rig feitos no editor.
