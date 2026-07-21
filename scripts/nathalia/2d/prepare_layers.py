#!/usr/bin/env python3
"""Build the clean 2D asset layer structure for Nathal.IA — without ever
destroying originals.

Creates `packages/character-nathalia/assets/2d/` with a layered layout and
**copies** (never moves) the existing art into it:

  * original sprite sheets               -> source/
  * production expression busts (.webp)  -> layers/face/expressions/
  * production visemes (vis-*.webp)       -> layers/face/visemes/
  * production context icons (icon-*.webp)-> layers/accessories/objects/

Folders that have no art yet (body orientations, arms, hands, poses, eyes,
mouths) are scaffolded with a README explaining what belongs there and how to
add it — so the structure is complete and self-documenting while the art is
still pending generation (see docs/nathalia/NEXT_STEPS_LIVE2D.md).

Idempotent: re-running only copies files whose bytes differ. The runtime assets
in `apps/web/public/nathalia/expressions/` are left untouched (they remain the
served source for the current avatar).

Usage:
    python scripts/nathalia/2d/prepare_layers.py [--force]

    --force   overwrite destination files even if present (default: copy only
              when missing or different).

Exit codes: 0 = ok, 2 = bad args.
"""
from __future__ import annotations

import filecmp
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
PKG = os.path.join(REPO_ROOT, "packages", "character-nathalia")
ASSETS_2D = os.path.join(PKG, "assets", "2d")
PROD = os.path.join(REPO_ROOT, "apps", "web", "public", "nathalia", "expressions")
SCRIPTS_NATHALIA = os.path.join(REPO_ROOT, "scripts", "nathalia")

# The complete layout. Each entry is a path relative to assets/2d/.
DIRS = [
    "source",
    "processed",
    "layers/body/front",
    "layers/body/left",
    "layers/body/right",
    "layers/body/back",
    "layers/face/expressions",
    "layers/face/eyes",
    "layers/face/mouths",
    "layers/face/visemes",
    "layers/arms",
    "layers/hands",
    "layers/poses",
    "layers/accessories/objects",
    "spritesheets",
    "animations",
    "exports",
]

# README text for folders pending art generation, keyed by relative path prefix.
PENDING_READMES = {
    "layers/body": (
        "# layers/body — corpo inteiro por orientação (PENDENTE)\n\n"
        "Arte de corpo inteiro nas 4 orientações: `front/`, `left/`, `right/`, "
        "`back/`. **Ainda não existe** (a Nath hoje é um busto de rosto). Para "
        "habilitar o compositing de corpo no avatar em camadas, gere PNGs com "
        "fundo transparente, centralizados, e rode `catalog_assets.py`.\n"
    ),
    "layers/face/eyes": (
        "# layers/face/eyes — olhos por estado (PENDENTE)\n\n"
        "Camada de olhos separada (aberto/fechado) permitiria piscar real sem "
        "encolher o busto inteiro. Hoje as expressões já trazem os olhos "
        "embutidos. Adicione frames transparentes de olhos e recatalogue.\n"
    ),
    "layers/face/mouths": (
        "# layers/face/mouths — bocas neutras (PENDENTE)\n\n"
        "Bocas independentes de fala. Os visemas de lip-sync já existem em "
        "`layers/face/visemes/`. Use esta pasta para bocas de expressão "
        "(sorriso/neutro) quando houver arte por camada.\n"
    ),
    "layers/arms": "# layers/arms — braços (PENDENTE)\n\nArte de braços por pose. Ainda não existe.\n",
    "layers/hands": "# layers/hands — mãos/gestos (PENDENTE)\n\nArte de mãos por gesto. Ainda não existe.\n",
    "layers/poses": (
        "# layers/poses — poses completas (PENDENTE)\n\n"
        "Poses de corpo inteiro (acenar, apontar, comemorar). Ainda não existe; "
        "o avatar em camadas cai para o busto de expressão até a arte ser gerada.\n"
    ),
    "processed": (
        "# processed — recortes/limpezas intermediárias\n\n"
        "Saída de etapas de preparo (recorte, remoção de fundo, centralização) "
        "antes de virar camada final. Gerado por scripts; não é arte original.\n"
    ),
    "spritesheets": "# spritesheets — folhas geradas\n\nSaída de `generate_spritesheet.py`.\n",
    "animations": "# animations — definições/exports de animação\n\nMetadados/preview de animações.\n",
    "exports": "# exports — variantes otimizadas p/ web\n\nSaída de `optimize_images.py`.\n",
}

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")


def rel(path: str) -> str:
    return os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")


def copy_if_needed(src: str, dst: str, force: bool, log: list[str]) -> None:
    if os.path.exists(dst) and not force:
        if filecmp.cmp(src, dst, shallow=False):
            return
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    shutil.copy2(src, dst)
    log.append(f"  copy {rel(src)} -> {rel(dst)}")


def is_sheet(name: str) -> bool:
    """A top-level source sheet in scripts/nathalia/ (not a crop, not a debug)."""
    low = name.lower()
    if not low.endswith(IMAGE_EXTS):
        return False
    if "_debug" in low or low.startswith("_"):
        return False
    return True


def main(argv: list[str]) -> int:
    force = "--force" in argv[1:]
    unknown = [a for a in argv[1:] if a != "--force"]
    if unknown:
        sys.stderr.write(f"unknown args: {unknown}\n")
        return 2

    log: list[str] = []

    # 1) Create the full directory tree.
    for d in DIRS:
        os.makedirs(os.path.join(ASSETS_2D, d), exist_ok=True)

    # 2) Scaffold READMEs for pending/utility folders (only when absent).
    for prefix, text in PENDING_READMES.items():
        readme = os.path.join(ASSETS_2D, prefix, "README.md")
        if not os.path.exists(readme):
            os.makedirs(os.path.dirname(readme), exist_ok=True)
            with open(readme, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(text)
            log.append(f"  scaffold {rel(readme)}")

    # 3) Copy original sheets -> source/ (top-level images in scripts/nathalia/).
    for fn in sorted(os.listdir(SCRIPTS_NATHALIA)):
        full = os.path.join(SCRIPTS_NATHALIA, fn)
        if os.path.isfile(full) and is_sheet(fn):
            copy_if_needed(full, os.path.join(ASSETS_2D, "source", fn), force, log)

    # 4) Copy production face assets into their layer folders.
    if os.path.isdir(PROD):
        for fn in sorted(os.listdir(PROD)):
            low = fn.lower()
            if not low.endswith(IMAGE_EXTS):
                continue
            src = os.path.join(PROD, fn)
            if low.startswith("vis-"):
                dst = os.path.join(ASSETS_2D, "layers/face/visemes", fn)
            elif low.startswith("icon-"):
                dst = os.path.join(ASSETS_2D, "layers/accessories/objects", fn)
            else:
                dst = os.path.join(ASSETS_2D, "layers/face/expressions", fn)
            copy_if_needed(src, dst, force, log)

    if log:
        sys.stderr.write("prepare_layers:\n" + "\n".join(log) + "\n")
    else:
        sys.stderr.write("prepare_layers: nothing to do (already in sync)\n")
    sys.stderr.write(f"structure ready at {rel(ASSETS_2D)}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
