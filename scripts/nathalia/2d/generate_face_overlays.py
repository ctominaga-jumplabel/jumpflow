#!/usr/bin/env python3
"""Generate first-pass separated face overlays from the current 2D busts.

The current Nathal.IA sources do not include PSD/Live2D-ready parts. This script
creates a deterministic, regenerable bridge from the existing production
visemes:

  * a neutral face base copied from ``vis-rest``;
  * transparent mouth overlays for each viseme, cropped from the same aligned
    viseme busts and feathered at the edges;
  * transparent eye overlays for open/closed blink states.

These are not a replacement for authored artwork, but they let the runtime use
real overlay layers and keep the old full-face viseme fallback intact.
"""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError:  # pragma: no cover
    sys.stderr.write("Pillow is required: pip install Pillow\n")
    sys.exit(1)

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[2]
PUBLIC = REPO_ROOT / "apps" / "web" / "public" / "nathalia"
EXPRESSIONS = PUBLIC / "expressions"
PUBLIC_LAYERS = PUBLIC / "layers" / "face"
PKG_LAYERS = (
    REPO_ROOT
    / "packages"
    / "character-nathalia"
    / "assets"
    / "2d"
    / "layers"
    / "face"
)

VISEMES = ["a", "e", "i", "o", "u", "s", "m", "l", "fv", "r", "tdn", "rest"]


def ensure_dirs() -> None:
    for root in (PUBLIC_LAYERS, PKG_LAYERS):
        for sub in ("base", "eyes", "mouths"):
            (root / sub).mkdir(parents=True, exist_ok=True)


def rel(path: Path) -> str:
    return path.relative_to(REPO_ROOT).as_posix()


def load_viseme(key: str) -> Image.Image:
    path = EXPRESSIONS / f"vis-{key}.webp"
    if not path.exists():
        raise FileNotFoundError(path)
    return Image.open(path).convert("RGBA")


def save_webp(im: Image.Image, public_path: Path) -> None:
    public_path.parent.mkdir(parents=True, exist_ok=True)
    im.save(public_path, "WEBP", quality=96, method=6)

    mirror = PKG_LAYERS / public_path.relative_to(PUBLIC_LAYERS)
    mirror.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(public_path, mirror)


def mouth_box(w: int, h: int) -> tuple[int, int, int, int]:
    return (
        round(w * 0.36),
        round(h * 0.54),
        round(w * 0.66),
        round(h * 0.73),
    )


def feathered_mask(size: tuple[int, int]) -> Image.Image:
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    margin_x = max(1, round(w * 0.10))
    margin_y = max(1, round(h * 0.12))
    draw.rounded_rectangle(
        (margin_x, margin_y, w - margin_x, h - margin_y),
        radius=max(2, round(h * 0.36)),
        fill=255,
    )
    return mask.filter(ImageFilter.GaussianBlur(max(1, round(min(size) * 0.08))))


def average_skin(base: Image.Image) -> tuple[int, int, int, int]:
    w, h = base.size
    samples: list[tuple[int, int, int, int]] = []
    for x in range(round(w * 0.45), round(w * 0.56)):
        for y in range(round(h * 0.50), round(h * 0.61)):
            r, g, b, a = base.getpixel((x, y))
            if a > 200 and r > 120 and g > 70 and b > 40:
                samples.append((r, g, b, a))
    if not samples:
        return (226, 164, 122, 245)
    return tuple(round(sum(px[i] for px in samples) / len(samples)) for i in range(4))


def generate_base() -> Image.Image:
    base = load_viseme("rest")
    save_webp(base, PUBLIC_LAYERS / "base" / "base-front.webp")
    return base


def generate_mouths(base: Image.Image) -> None:
    base_size = base.size
    w, h = base_size
    box = mouth_box(w, h)
    soft_bounds = feathered_mask((box[2] - box[0], box[3] - box[1]))
    rest_patch = base.crop(box)

    for key in VISEMES:
        overlay = Image.new("RGBA", base_size, (0, 0, 0, 0))
        if key != "rest":
            src = load_viseme(key)
            if src.size != base_size:
                src = src.resize(base_size, Image.LANCZOS)
            patch = src.crop(box)
            alpha = Image.new("L", patch.size, 0)
            patch_px = patch.load()
            rest_px = rest_patch.load()
            alpha_px = alpha.load()
            for y in range(patch.height):
                for x in range(patch.width):
                    sr, sg, sb, sa = patch_px[x, y]
                    rr, rg, rb, _ra = rest_px[x, y]
                    diff = max(abs(sr - rr), abs(sg - rg), abs(sb - rb))
                    # Keep the mouth shape and nearby changed pixels, but avoid
                    # pasting a visible skin rectangle over expression faces.
                    a = 0 if diff < 14 else min(255, (diff - 14) * 9)
                    alpha_px[x, y] = min(a, sa, soft_bounds.getpixel((x, y)))
            alpha = alpha.filter(ImageFilter.GaussianBlur(0.45))
            overlay.paste(patch, box[:2], alpha)
        save_webp(overlay, PUBLIC_LAYERS / "mouths" / f"mouth-{key}.webp")


def generate_eyes(base: Image.Image) -> None:
    w, h = base.size
    transparent = Image.new("RGBA", base.size, (0, 0, 0, 0))
    save_webp(transparent, PUBLIC_LAYERS / "eyes" / "eyes-open.webp")

    skin = average_skin(base)
    closed = Image.new("RGBA", base.size, (0, 0, 0, 0))
    mask = Image.new("L", base.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    draw = ImageDraw.Draw(closed)

    eyes = [
        (w * 0.37, h * 0.39),
        (w * 0.62, h * 0.39),
    ]
    rx = w * 0.115
    ry = h * 0.075
    for cx, cy in eyes:
        box = (cx - rx, cy - ry, cx + rx, cy + ry)
        mask_draw.ellipse(box, fill=245)
    mask = mask.filter(ImageFilter.GaussianBlur(max(1, round(w * 0.008))))

    skin_layer = Image.new("RGBA", base.size, skin)
    closed = Image.composite(skin_layer, closed, mask)
    draw = ImageDraw.Draw(closed)
    line = (62, 42, 35, 230)
    for cx, cy in eyes:
        arc_box = (cx - rx * 0.78, cy - ry * 0.15, cx + rx * 0.78, cy + ry * 0.95)
        draw.arc(arc_box, start=190, end=350, fill=line, width=max(2, round(w * 0.012)))
    save_webp(closed, PUBLIC_LAYERS / "eyes" / "eyes-closed.webp")


def main() -> int:
    ensure_dirs()
    base = generate_base()
    generate_mouths(base)
    generate_eyes(base)
    sys.stderr.write(
        "generated face overlays: "
        f"{rel(PUBLIC_LAYERS / 'base' / 'base-front.webp')}, "
        f"{len(VISEMES)} mouths, 2 eye overlays\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
