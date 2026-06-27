#!/usr/bin/env python3
"""Describe a Nathal.IA .glb (no judgement).

The lighter sibling of ``validate_glb.py``: it *describes* what is inside a file
without checking it against the contract. Both share ``glb_metrics.py``, so the
numbers always agree.

Modes:
  * Inside Blender (``bpy``): objects, meshes, materials, actions, shape keys,
    triangles, vertices, dimensions, rig bones.
  * Outside Blender: structural summary from the .glb JSON chunk.

Never modifies the file.

Usage:
    python inspect_glb.py <path-to.glb>
    blender --background --python inspect_glb.py -- <path-to.glb>
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import glb_metrics as gm  # noqa: E402


def parse_args(argv: list[str]) -> str | None:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = argv[1:]
    for arg in argv:
        if not arg.startswith("--"):
            return arg
    return None


def default_target() -> str:
    return gm.load_config()["paths"]["master"]


def _yn(value) -> str:
    if value is None:
        return "?"
    return "yes" if value else "no"


def describe(metrics: dict) -> None:
    c = metrics["counts"]
    print(f"== inspect_glb.py ({metrics['mode']}) :: {metrics['fileName']} ==")
    print(f"  file size : {metrics['fileSizeHuman']}")
    print("\n-- Counts --")
    for key in ("objects", "meshes", "materials", "triangles", "vertices",
                "animations", "shapeKeys", "textures", "images"):
        v = c.get(key)
        print(f"  {key:<11}: {'?' if v is None else v}")

    print("\n-- Presence --")
    print(f"  rig        : {_yn(metrics['hasRig'])}")
    print(f"  animations : {_yn(metrics['hasAnimations'])}")
    print(f"  shapeKeys  : {_yn(metrics['hasShapeKeys'])}")

    if metrics.get("dimensions"):
        d = metrics["dimensions"]
        print(f"\n-- Dimensions (Blender units) --\n  x={d['x']} y={d['y']} z={d['z']}")

    _list("Objects", metrics["objectsList"])
    _list("Meshes", metrics["meshesList"])
    _list("Materials", metrics["materialsList"])
    _list("Animations", metrics["animationsList"])
    _list("Shape keys", metrics["shapeKeysList"])
    _list("Rig bones", metrics["armatureBones"])

    if metrics["notes"]:
        print("\n-- Notes --")
        for note in metrics["notes"]:
            print(f"  {note}")


def _list(label: str, items: list[str]) -> None:
    if not items:
        return
    print(f"\n-- {label} ({len(items)}) --")
    for name in items:
        print(f"  {name}")


def main() -> int:
    path = parse_args(sys.argv) or default_target()
    if not os.path.exists(path):
        print(f"== inspect_glb.py ==\nTarget não encontrado: {path}")
        print("Nada para inspecionar ainda. Baixe o .glb do Tripo para "
              "assets/nathalia/raw/ (Fase 3A).")
        return 0
    metrics = gm.collect_metrics(path)
    describe(metrics)
    return 0


if __name__ == "__main__":
    sys.exit(main())
