#!/usr/bin/env python3
"""Validate and web-optimize the Nathal.IA 2D layer assets.

Two jobs, neither of which touches the originals:

  1. **Validate** (always): report layer images that *should* be transparent but
     are not, plus inconsistent / non-square dimensions. Face/viseme/object
     layers must have an alpha channel to composite cleanly over the body and
     each other.

  2. **Optimize** (default): write web-optimized `.webp` variants into
     `assets/2d/exports/<layer>/`, each centered on a square transparent canvas
     of a target size so every layer shares a consistent coordinate space (makes
     compositing and spritesheets trivial). Lossless-ish, no upscaling beyond the
     target, originals untouched.

Usage:
    python scripts/nathalia/2d/optimize_images.py [--validate-only] [--size N] [--force]

    --validate-only  only report; write nothing.
    --size N         square export canvas (default 256).
    --force          re-export even if the target exists.

Exit codes: 0 = ok (no blocking issues), 1 = transparency violations found, 2 = bad args.
"""
from __future__ import annotations

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

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp")
# Layer sub-trees whose assets must be transparent to composite correctly.
ALPHA_REQUIRED_PREFIXES = ("face", "body", "arms", "hands", "poses", "accessories")


def rel(path: str) -> str:
    return os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")


def layer_of(path: str) -> str:
    """Top-level layer name relative to layers/ (e.g. 'face', 'body')."""
    r = os.path.relpath(path, LAYERS).replace(os.sep, "/")
    return r.split("/", 1)[0]


def iter_layer_images():
    if not os.path.isdir(LAYERS):
        return
    for dirpath, _d, files in os.walk(LAYERS):
        for fn in sorted(files):
            if fn.lower().endswith(IMAGE_EXTS):
                yield os.path.join(dirpath, fn)


def has_real_alpha(im: "Image.Image") -> bool:
    if im.mode not in ("RGBA", "LA") and not (im.mode == "P" and "transparency" in im.info):
        return False
    rgba = im.convert("RGBA")
    return rgba.getchannel("A").getextrema()[0] < 255


def validate() -> list[str]:
    """Return list of human-readable violations (empty = clean)."""
    violations: list[str] = []
    dims: dict[str, list[tuple[int, int]]] = {}
    for path in iter_layer_images():
        layer = layer_of(path)
        with Image.open(path) as im:
            w, h = im.size
            alpha = has_real_alpha(im)
        dims.setdefault(layer, []).append((w, h))
        if layer in ALPHA_REQUIRED_PREFIXES and not alpha:
            violations.append(f"NO ALPHA: {rel(path)} ({layer} layer must be transparent)")
        if w != h:
            # Non-square is allowed for small object icons; warn only for face/body.
            if layer in ("face", "body", "poses"):
                violations.append(f"NON-SQUARE: {rel(path)} ({w}x{h}) — face/body should be square")
    return violations


def optimize(size: int, force: bool) -> list[str]:
    written: list[str] = []
    for path in iter_layer_images():
        sub = os.path.relpath(os.path.dirname(path), LAYERS).replace(os.sep, "/")
        out_dir = os.path.join(EXPORTS, sub)
        base = os.path.splitext(os.path.basename(path))[0]
        out = os.path.join(out_dir, base + ".webp")
        if os.path.exists(out) and not force:
            continue
        with Image.open(path) as im:
            im = im.convert("RGBA")
            # Fit (no upscale beyond target), then center on a square canvas.
            scale = min(size / im.width, size / im.height, 1.0)
            new_w = max(1, round(im.width * scale))
            new_h = max(1, round(im.height * scale))
            resized = im.resize((new_w, new_h), Image.LANCZOS)
            canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
            canvas.paste(resized, ((size - new_w) // 2, (size - new_h) // 2), resized)
            os.makedirs(out_dir, exist_ok=True)
            canvas.save(out, "WEBP", quality=92, method=6)
        written.append(f"  export {rel(out)}")
    return written


def main(argv: list[str]) -> int:
    args = argv[1:]
    validate_only = "--validate-only" in args
    force = "--force" in args
    size = 256
    if "--size" in args:
        i = args.index("--size")
        if i + 1 >= len(args):
            sys.stderr.write("--size needs a value\n")
            return 2
        try:
            size = int(args[i + 1])
        except ValueError:
            sys.stderr.write("--size must be an integer\n")
            return 2
    known = {"--validate-only", "--force", "--size", str(size)}
    unknown = [a for a in args if a not in known]
    if unknown:
        sys.stderr.write(f"unknown args: {unknown}\n")
        return 2

    violations = validate()
    if violations:
        sys.stderr.write("transparency/size report:\n  " + "\n  ".join(violations) + "\n")
    else:
        sys.stderr.write("transparency/size report: all layer assets OK\n")

    if not validate_only:
        written = optimize(size, force)
        if written:
            sys.stderr.write(f"optimized {len(written)} asset(s) -> {rel(EXPORTS)} (size {size}):\n")
            sys.stderr.write("\n".join(written[:8]) + ("\n  ..." if len(written) > 8 else "") + "\n")
        else:
            sys.stderr.write("optimize: nothing to do (exports up to date)\n")

    return 1 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
