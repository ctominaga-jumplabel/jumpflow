#!/usr/bin/env python3
"""Render 2D thumbnails of the Nathal.IA master.glb.

PHASE 2 STATUS: stub. No images are produced yet. Thumbnails are the 2D fallback
shown when WebGL is unavailable (see docs/nathalia/ASSET_GUIDE.md and the React
``NathaliaAvatar`` fallback). Like every derived asset, they come FROM the
master.glb (DECISIONS.md D-001), never hand-drawn off-model.

Planned thumbnails (one per emotional state, from config.states):
    assets/thumbnails/nathalia-<state>.png   (e.g. nathalia-idle.png)
plus a neutral bust used by the small circular avatar.

Future implementation (inside Blender):
  1. import master.glb,
  2. set a 3-point studio light + orthographic-ish camera framing the bust,
  3. pose to the state's expression (shape keys) + body clip,
  4. render a square PNG (e.g. 256x256, transparent background),
  5. write to paths.thumbnailsDir.

Usage (future):
    blender --background --python generate_thumbnails.py -- <master.glb> [--size 256]

Today it only prints the plan. Exit codes: 0 = ok/plan, 1 = missing master.
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
    size = 256
    it = iter(argv)
    for arg in it:
        if arg == "--size":
            nxt = next(it, None)
            if nxt and nxt.isdigit():
                size = int(nxt)
        elif not arg.startswith("--") and path is None:
            path = arg
    return {"path": path, "size": size}


def main() -> int:
    cfg = load_config()
    args = parse_args(sys.argv)
    master = args["path"] or cfg["paths"]["master"]
    out_dir = cfg["paths"]["thumbnailsDir"]
    states = cfg["states"]

    print("== generate_thumbnails.py ==")
    print(f"master    : {master}")
    print(f"output dir: {out_dir}")
    print(f"size      : {args['size']}x{args['size']}")

    if not os.path.exists(master):
        print("\nmaster.glb not found -> nothing to render.")
        print("Expected in Phase 2. Thumbnails are produced in Phase 5/6.")
        print("\nPlanned thumbnails (one per state + a neutral bust):")
        for s in states:
            print(f"  - {os.path.join(out_dir, 'nathalia-' + s + '.png')}")
        print(f"  - {os.path.join(out_dir, 'nathalia-bust.png')}")
        return 1

    try:
        import bpy  # noqa: F401
    except Exception:
        print("\nmaster found, but Blender (bpy) is required to render.")
        print("Run under: blender --background --python ... -- " + master)
        return 1

    print("\n[stub] Blender available + master present.")
    print("Real rendering is implemented in Phase 5/6.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
