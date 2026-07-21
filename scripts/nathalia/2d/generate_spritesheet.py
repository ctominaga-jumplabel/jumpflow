#!/usr/bin/env python3
"""Pack a Nathal.IA layer into a single spritesheet (+ JSON frame map).

Useful when a layer has many frames you'd rather ship as one request (e.g. all
visemes for canvas-based lip-sync, or all expressions for a picker). Reads the
normalized exports from `optimize_images.py` when present (consistent square
cells), else the raw layer assets.

Writes to `assets/2d/spritesheets/<layer>.webp` and `<layer>.json` (a TexturePacker-
lite frame map: name → {x, y, w, h}). Originals untouched, output idempotent.

Usage:
    python scripts/nathalia/2d/generate_spritesheet.py [--layer face/visemes] [--cols N] [--cell N]

    --layer PATH   layer subpath under layers/ (default: face/visemes).
    --cols N       columns in the sheet (default: 6).
    --cell N       cell size in px (default: 128; exports are 256 — downscaled to fit).

Exit codes: 0 = ok, 1 = no frames found, 2 = bad args.
"""
from __future__ import annotations

import json
import math
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.stderr.write("Pillow is required: pip install Pillow\n")
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASSETS_2D = os.path.join(REPO_ROOT, "packages", "character-nathalia", "assets", "2d")
LAYERS = os.path.join(ASSETS_2D, "layers")
EXPORTS = os.path.join(ASSETS_2D, "exports")
SHEETS = os.path.join(ASSETS_2D, "spritesheets")

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")


def rel(path: str) -> str:
    return os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")


def find_frames(layer: str) -> list[str]:
    # Prefer normalized exports (square cells); fall back to raw layer assets.
    for root in (os.path.join(EXPORTS, layer), os.path.join(LAYERS, layer)):
        if os.path.isdir(root):
            frames = [
                os.path.join(root, fn)
                for fn in sorted(os.listdir(root))
                if fn.lower().endswith(IMAGE_EXTS)
            ]
            if frames:
                return frames
    return []


def main(argv: list[str]) -> int:
    args = argv[1:]
    layer = "face/visemes"
    cols = 6
    cell = 128

    def take(flag: str, default):
        if flag in args:
            i = args.index(flag)
            if i + 1 >= len(args):
                raise ValueError(f"{flag} needs a value")
            return args[i + 1]
        return default

    try:
        layer = str(take("--layer", layer))
        cols = int(take("--cols", cols))
        cell = int(take("--cell", cell))
    except ValueError as exc:
        sys.stderr.write(f"{exc}\n")
        return 2

    frames = find_frames(layer)
    if not frames:
        sys.stderr.write(f"no frames found for layer '{layer}'\n")
        return 1

    rows = math.ceil(len(frames) / cols)
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (0, 0, 0, 0))
    frame_map: dict[str, dict] = {}

    for idx, path in enumerate(frames):
        with Image.open(path) as im:
            im = im.convert("RGBA")
            scale = min(cell / im.width, cell / im.height, 1.0)
            w, h = max(1, round(im.width * scale)), max(1, round(im.height * scale))
            im = im.resize((w, h), Image.LANCZOS)
            cx, cy = (idx % cols) * cell, (idx // cols) * cell
            ox, oy = cx + (cell - w) // 2, cy + (cell - h) // 2
            sheet.paste(im, (ox, oy), im)
            name = os.path.splitext(os.path.basename(path))[0]
            frame_map[name] = {"x": ox, "y": oy, "w": w, "h": h}

    os.makedirs(SHEETS, exist_ok=True)
    safe = layer.replace("/", "-")
    out_img = os.path.join(SHEETS, f"{safe}.webp")
    out_json = os.path.join(SHEETS, f"{safe}.json")
    sheet.save(out_img, "WEBP", quality=92, method=6)
    meta = {
        "layer": layer,
        "cell": cell,
        "cols": cols,
        "rows": rows,
        "count": len(frames),
        "image": rel(out_img),
        "frames": frame_map,
    }
    with open(out_json, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")

    sys.stderr.write(
        f"spritesheet: {len(frames)} frames -> {rel(out_img)} ({cols}x{rows} @ {cell}px)\n"
        f"frame map -> {rel(out_json)}\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
