#!/usr/bin/env python3
"""Export derived variants of the Nathal.IA master.glb.

PHASE 2 STATUS: stub. No binaries are produced yet. This script documents *how*
variants will be derived and fails gracefully when ``master.glb`` does not exist.

Contract (see DECISIONS.md D-001): the ``master.glb`` is the single source of
truth. Every variant below is DERIVED from it programmatically and is never
hand-edited:

    master.glb
      ├─ lod0  : = master (panel / large avatar)
      ├─ lod1  : decimated mesh (~20k tris) for medium avatars
      ├─ lod2  : decimated mesh (~8k tris) for tiny avatars (40-64px)
      └─ bust  : bust/face crop for the small circular avatar

Planned variants are declared in ``nathalia_assets.config.json`` -> plannedVariants.

Future implementation (inside Blender) will, per variant:
  1. import master.glb fresh,
  2. apply a Decimate modifier to hit the target tri budget (LODs),
  3. or trim geometry below the neck (bust),
  4. re-export a .glb into paths.variantsDir with Draco/Meshopt compression.

Usage (future):
    blender --background --python export_variants.py -- <master.glb> [--only lod2]

Today it only prints the plan. Exit codes: 0 = ok/plan printed, 1 = missing master.
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
    only = None
    it = iter(argv)
    for arg in it:
        if arg == "--only":
            only = next(it, None)
        elif not arg.startswith("--") and path is None:
            path = arg
    return {"path": path, "only": only}


def main() -> int:
    cfg = load_config()
    args = parse_args(sys.argv)
    master = args["path"] or cfg["paths"]["master"]
    variants = cfg["plannedVariants"]
    if args["only"]:
        variants = [v for v in variants if v["key"] == args["only"]]

    print("== export_variants.py ==")
    print(f"master (source of truth): {master}")
    print(f"output dir              : {cfg['paths']['variantsDir']}")

    if not os.path.exists(master):
        print("\nmaster.glb not found yet -> nothing to export.")
        print("This is expected in Phase 2. A model arrives in Phase 3/4.")
        print("\nPlanned variants (would be derived from master):")
        for v in variants:
            budget = v.get("targetMaxTris")
            suffix = f" (<= {budget} tris)" if budget else ""
            print(f"  - {v['key']}{suffix}: {v['description']}")
        return 1  # friendly failure: caller knows nothing was produced

    # master exists but real export needs Blender geometry ops.
    try:
        import bpy  # noqa: F401
    except Exception:
        print("\nmaster found, but Blender (bpy) is required to export variants.")
        print("Run under: blender --background --python ... -- " + master)
        return 1

    print("\n[stub] Blender available + master present.")
    print("Real decimation/crop export is implemented in Phase 6.")
    for v in variants:
        print(f"  would export: {v['key']} -> "
              f"{os.path.join(cfg['paths']['variantsDir'], 'nathalia-' + v['key'] + '.glb')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
