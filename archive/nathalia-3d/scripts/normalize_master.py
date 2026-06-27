#!/usr/bin/env python3
"""Normalize a Nathal.IA master.glb to the asset contract.

PHASE 2 STATUS: stub. The normalization functions below are non-destructive
placeholders. NOTHING is changed unless you pass ``--apply`` AND run inside
Blender. This guards against accidental edits to the source of truth.

What normalization will eventually enforce (see GLB_REQUIREMENTS.md):
  * scale       : 1 unit = 1 meter,
  * origin      : feet on the floor, centered at (0,0,0),
  * orientation : character facing -Z, +Y up,
  * object names: Body, Hair, Shirt, Pants, Shoes, Eyes, Logo,
  * material names: MAT_Body, MAT_Hair, ... (from config).

Usage:
    # dry run (default) -- reports what it WOULD do, changes nothing:
    blender --background --python normalize_master.py -- <master.glb>
    # apply changes and re-export:
    blender --background --python normalize_master.py -- <master.glb> --apply

Exit codes: 0 = ok/dry-run, 1 = missing file / bpy required, 2 = bad args.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "nathalia_assets.config.json")


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def parse_args(argv: list[str]) -> dict:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = argv[1:]
    path = None
    apply = False
    for arg in argv:
        if arg == "--apply":
            apply = True
        elif not arg.startswith("--") and path is None:
            path = arg
    return {"path": path, "apply": apply}


# --- normalization steps (stubs) -------------------------------------------
# Each returns a human-readable description of the action. When `apply` is True
# and `bpy` is present, the real transform would run here. They are deliberately
# side-effect free in this phase.

def normalize_scale(cfg: dict, apply: bool) -> str:
    target = cfg["transform"]["unitMetersPerUnit"]
    return f"scale -> {target} unit/meter" + ("" if apply else " (dry)")


def normalize_origin(cfg: dict, apply: bool) -> str:
    xyz = cfg["transform"]["originXYZ"]
    return f"origin -> feet on floor, centered at {tuple(xyz)}" + ("" if apply else " (dry)")


def normalize_orientation(cfg: dict, apply: bool) -> str:
    return (f"orientation -> facing {cfg['transform']['facingAxis']}, "
            f"up {cfg['transform']['upAxis']}" + ("" if apply else " (dry)"))


def normalize_object_names(cfg: dict, apply: bool) -> str:
    return f"object names -> {cfg['objects']}" + ("" if apply else " (dry)")


def normalize_material_names(cfg: dict, apply: bool) -> str:
    return f"material names -> {cfg['materials']}" + ("" if apply else " (dry)")


STEPS = (
    normalize_scale,
    normalize_origin,
    normalize_orientation,
    normalize_object_names,
    normalize_material_names,
)


def main() -> int:
    cfg = load_config()
    args = parse_args(sys.argv)
    path = args["path"] or cfg["paths"]["master"]
    apply = args["apply"]

    print("== normalize_master.py ==")
    print(f"target: {path}")
    print(f"mode  : {'APPLY (destructive)' if apply else 'dry-run (safe)'}")

    if not os.path.exists(path):
        print("\nmaster.glb not found -> nothing to normalize.")
        print("Expected in Phase 2. A model arrives in Phase 3/4.")
        return 1

    try:
        import bpy  # noqa: F401

        has_bpy = True
    except Exception:
        has_bpy = False

    if apply and not has_bpy:
        print("\nERROR: --apply requires Blender (bpy). Aborting without changes.")
        return 1

    print("\nNormalization steps:")
    for step in STEPS:
        print(f"  - {step(cfg, apply)}")

    if not apply:
        print("\nNo changes made (dry-run). Re-run with --apply inside Blender.")
    else:
        print("\n[stub] Real transforms land in Phase 4. Source of truth preserved.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
