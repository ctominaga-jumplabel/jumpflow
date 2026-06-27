#!/usr/bin/env python3
"""Render preview images (turnaround/closeups) of the Nathal.IA master scene.

PHASE 4 STATUS: prepared structure. Documents how preview renders will be
produced and degrades gracefully. Writes nothing unless ``--apply`` is passed
inside Blender with a built scene. These previews feed the Character Sheet and
the 2D fallback thumbnails — they are derived from the master (D-001), never
hand-painted.

Planned previews (written to ``paths.previewDir``):
  * ``nathalia-front.png``  — front orthographic,
  * ``nathalia-side.png``   — side orthographic,
  * ``nathalia-3q.png``     — 3/4 hero angle,
  * ``nathalia-face.png``   — face closeup (for expressions reference).

Usage:
    blender --background --python export_preview_images.py            # dry-run
    blender --background --python export_preview_images.py -- --apply # render

Exit codes: 0 = ok/dry-run, 1 = --apply without Blender or empty scene.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402

PREVIEWS = [
    ("nathalia-front.png", "front orthographic"),
    ("nathalia-side.png", "side orthographic"),
    ("nathalia-3q.png", "3/4 hero angle"),
    ("nathalia-face.png", "face closeup (expressions)"),
]


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv, flags=("--apply",))
    out_dir = cfg["paths"]["previewDir"]
    apply = args["apply"]

    print("== export_preview_images.py ==")
    print(f"output dir: {out_dir}")
    print(f"mode      : {'APPLY (renderiza)' if apply else 'dry-run (seguro)'}")
    print("\nPreviews planejados:")
    for filename, desc in PREVIEWS:
        print(f"  - {filename}: {desc}")

    if not apply:
        print("\nNenhuma imagem renderizada (dry-run). Use --apply dentro do Blender.")
        return 0

    if not pc.in_blender():
        print("\nERROR: --apply requer Blender (bpy). Abortando.")
        return 1

    import bpy

    if not [o for o in bpy.data.objects if o.type == "MESH"]:
        print("\nERROR: cena vazia — nada para renderizar.")
        return 1

    print("\n[estrutura] Câmeras/luzes de preview e render real entram na Fase 5/6,")
    print("quando houver um master.blend construído. Diretório garantido abaixo.")
    os.makedirs(os.path.abspath(out_dir), exist_ok=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
