#!/usr/bin/env python3
"""Detect and crop individual expression regions from Nathal.IA sheets.

The Nathal.IA character sheets (e.g. ``docs/nathalia/Avatar_NathIA.png``) pack
many expressions / visemes / poses onto a single light-gray canvas. This script
loads one or more of those sheets, isolates each figure against the background,
crops every region to its own file and saves them at full source resolution.

Approach (pure OpenCV + NumPy):
  1. Estimate the flat background color by sampling the image border.
  2. Build a foreground mask = pixels that differ from the background.
  3. Morphologically close the mask so a figure + its small label/confetti fuse
     into one blob instead of fragmenting.
  4. Find external contours, keep those above a min-area threshold.
  5. Sort the bounding boxes into human reading order (cluster into rows by the
     vertical overlap, then left-to-right inside each row).
  6. Crop each box (with a little padding) and write it out.

Files are named ``<sheet>_r<row>c<col>.png`` (row/column from reading order) so
the position is recoverable, plus a zero-padded sequential index is available
via ``--name-mode seq``.

Usage:
    python crop_expression_sheets.py IMAGE [IMAGE ...] [options]

Examples:
    # Crop a single sheet into ./out
    python crop_expression_sheets.py docs/nathalia/Avatar_NathIA.png -o out

    # Several sheets, tuning sensitivity, with a preview overlay for debugging
    python crop_expression_sheets.py sheet1.png sheet2.png \
        --min-area-frac 0.004 --pad 8 --debug

Dependencies:
    pip install opencv-python numpy
"""
from __future__ import annotations

import argparse
import os
import sys
from typing import List, Tuple

try:
    import cv2
    import numpy as np
except ImportError:  # pragma: no cover - dependency guard
    sys.stderr.write(
        "This script needs OpenCV and NumPy.\n"
        "Install them with:  pip install opencv-python numpy\n"
    )
    raise

Box = Tuple[int, int, int, int]  # (x, y, w, h)


def estimate_background(img: np.ndarray, border: int = 12) -> np.ndarray:
    """Return the median color of the image border as the background color.

    The sheets sit on a single flat backdrop, so the outermost pixels are a
    reliable sample of it even when figures crowd the interior.
    """
    h, w = img.shape[:2]
    b = max(1, min(border, h // 2, w // 2))
    strips = [
        img[:b, :, :].reshape(-1, 3),
        img[-b:, :, :].reshape(-1, 3),
        img[:, :b, :].reshape(-1, 3),
        img[:, -b:, :].reshape(-1, 3),
    ]
    border_pixels = np.concatenate(strips, axis=0)
    return np.median(border_pixels, axis=0)


def foreground_mask(img: np.ndarray, bg: np.ndarray, tol: int, close_px: int) -> np.ndarray:
    """Build a binary mask of pixels that differ from the background color."""
    diff = np.abs(img.astype(np.int16) - bg.astype(np.int16)).max(axis=2)
    mask = (diff > tol).astype(np.uint8) * 255

    # Drop salt-and-pepper noise, then close gaps so a figure and its nearby
    # label / accent marks merge into a single connected region.
    mask = cv2.morphologyEx(
        mask, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    )
    if close_px > 0:
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close_px, close_px))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, k)
    return mask


def detect_boxes(mask: np.ndarray, min_area: float) -> List[Box]:
    """Find external contours above ``min_area`` and return their bounding boxes."""
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes: List[Box] = []
    for c in contours:
        if cv2.contourArea(c) < min_area:
            continue
        x, y, w, h = cv2.boundingRect(c)
        boxes.append((x, y, w, h))
    return boxes


def _find_bands(profile: np.ndarray, active_thresh: float, min_size: int) -> List[Tuple[int, int]]:
    """Return [start, end) spans where ``profile`` stays above ``active_thresh``.

    Spans thinner than ``min_size`` are dropped — this discards thin label/text
    strips while keeping the tall figure bands (and the wide figure columns).
    """
    bands: List[Tuple[int, int]] = []
    start = None
    for i, v in enumerate(profile):
        if v > active_thresh and start is None:
            start = i
        elif v <= active_thresh and start is not None:
            if i - start >= min_size:
                bands.append((start, i))
            start = None
    if start is not None and len(profile) - start >= min_size:
        bands.append((start, len(profile)))
    return bands


def detect_boxes_grid(mask: np.ndarray, args: argparse.Namespace) -> List[Box]:
    """Split an evenly-laid-out grid by projection valleys.

    Figures whose hair/shoulders touch their neighbours defeat contour detection
    (a whole row collapses into one blob). Instead we project the foreground
    mask onto each axis and cut at the background gaps:
      1. Row bands  = horizontal projection (foreground px per row).
      2. Per band, column splits = vertical projection within that band.
    Thin label/text strips are filtered out by the min-size guards.
    """
    h, w = mask.shape[:2]
    fg = (mask > 0).astype(np.int32)

    row_profile = fg.sum(axis=1)
    row_bands = _find_bands(
        row_profile,
        active_thresh=args.grid_row_thresh * w,
        min_size=int(args.grid_min_row_frac * h),
    )

    boxes: List[Box] = []
    for (y0, y1) in row_bands:
        band = fg[y0:y1, :]
        col_profile = band.sum(axis=0)
        col_bands = _find_bands(
            col_profile,
            active_thresh=args.grid_col_thresh * (y1 - y0),
            min_size=int(args.grid_min_col_frac * w),
        )
        for (x0, x1) in col_bands:
            # Tighten the box vertically to the actual content in this column.
            sub = band[:, x0:x1].sum(axis=1)
            ys = np.nonzero(sub > 0)[0]
            if ys.size == 0:
                continue
            ty0, ty1 = y0 + int(ys[0]), y0 + int(ys[-1]) + 1
            boxes.append((x0, ty0, x1 - x0, ty1 - ty0))
    return boxes


def sort_reading_order(boxes: List[Box], row_tol_frac: float = 0.5) -> List[Tuple[int, int, Box]]:
    """Cluster boxes into rows (by vertical overlap) then sort left-to-right.

    Returns a list of ``(row_index, col_index, box)`` so callers can name files
    by their grid position.
    """
    if not boxes:
        return []

    remaining = sorted(boxes, key=lambda b: b[1])  # top to bottom
    rows: List[List[Box]] = []
    for box in remaining:
        _, y, _, h = box
        cy = y + h / 2
        placed = False
        for row in rows:
            ry, rh = row[0][1], row[0][3]
            # Same row if this box's center falls within the row's vertical span
            # (with tolerance), making it robust to differing figure heights.
            if abs(cy - (ry + rh / 2)) <= row_tol_frac * max(rh, h):
                row.append(box)
                placed = True
                break
        if not placed:
            rows.append([box])

    rows.sort(key=lambda r: min(b[1] for b in r))
    ordered: List[Tuple[int, int, Box]] = []
    for ri, row in enumerate(rows):
        for ci, box in enumerate(sorted(row, key=lambda b: b[0])):
            ordered.append((ri, ci, box))
    return ordered


def crop_with_padding(img: np.ndarray, box: Box, pad: int) -> np.ndarray:
    h, w = img.shape[:2]
    x, y, bw, bh = box
    x0, y0 = max(0, x - pad), max(0, y - pad)
    x1, y1 = min(w, x + bw + pad), min(h, y + bh + pad)
    return img[y0:y1, x0:x1]


def process_sheet(path: str, args: argparse.Namespace) -> int:
    img = cv2.imread(path, cv2.IMREAD_COLOR)
    if img is None:
        sys.stderr.write(f"  ! could not read image: {path}\n")
        return 0

    h, w = img.shape[:2]
    bg = estimate_background(img)
    mask = foreground_mask(img, bg, tol=args.tol, close_px=args.close)

    if args.mode == "grid":
        boxes = detect_boxes_grid(mask, args)
    else:
        min_area = args.min_area_frac * (h * w)
        boxes = detect_boxes(mask, min_area=min_area)
    ordered = sort_reading_order(boxes)

    stem = os.path.splitext(os.path.basename(path))[0]
    out_dir = args.output
    os.makedirs(out_dir, exist_ok=True)

    print(f"  background ~ BGR{tuple(int(v) for v in bg)} | "
          f"mode = {args.mode} | found {len(ordered)} regions")

    debug_img = img.copy() if args.debug else None
    saved = 0
    for seq, (ri, ci, box) in enumerate(ordered):
        crop = crop_with_padding(img, box, args.pad)
        if crop.size == 0:
            continue

        if args.name_mode == "seq":
            name = f"{stem}_{seq:03d}.png"
        else:  # position
            name = f"{stem}_r{ri:02d}c{ci:02d}.png"

        cv2.imwrite(os.path.join(out_dir, name), crop)
        saved += 1

        if debug_img is not None:
            x, y, bw, bh = box
            cv2.rectangle(debug_img, (x, y), (x + bw, y + bh), (0, 128, 255), 3)
            cv2.putText(debug_img, str(seq), (x + 4, y + 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 255), 2, cv2.LINE_AA)

    if debug_img is not None:
        dbg_path = os.path.join(out_dir, f"{stem}_DEBUG.png")
        cv2.imwrite(dbg_path, debug_img)
        print(f"  debug overlay -> {dbg_path}")

    print(f"  saved {saved} crops -> {out_dir}")
    return saved


def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Detect and crop individual expression regions from Nathal.IA sheets.")
    p.add_argument("images", nargs="+", help="One or more sheet image paths.")
    p.add_argument("-o", "--output", default="cropped_expressions",
                   help="Output directory (created if missing). Default: ./cropped_expressions")
    p.add_argument("--tol", type=int, default=28,
                   help="Per-channel difference from background to count as foreground (0-255). "
                        "Lower = more sensitive. Default: 28")
    p.add_argument("--close", type=int, default=25,
                   help="Morphological close kernel in px; fuses a figure with its nearby "
                        "label/accents. Larger = merges more aggressively. Default: 25")
    p.add_argument("--min-area-frac", type=float, default=0.004,
                   help="[contour mode] Discard regions smaller than this fraction of the "
                        "sheet area. Default: 0.004 (0.4%%)")
    p.add_argument("--mode", choices=["contour", "grid"], default="contour",
                   help="Detection mode. 'contour' (default) for separated figures; "
                        "'grid' splits an evenly-laid-out sheet by projection valleys "
                        "(use when faces in a row touch and collapse into one box).")
    p.add_argument("--grid-row-thresh", type=float, default=0.02,
                   help="[grid] A row counts as figure content if foreground px exceed this "
                        "fraction of the sheet width. Default: 0.02")
    p.add_argument("--grid-col-thresh", type=float, default=0.04,
                   help="[grid] A column counts as figure content if foreground px exceed this "
                        "fraction of the band height. Raise to cut at fainter gaps. Default: 0.04")
    p.add_argument("--grid-min-row-frac", type=float, default=0.06,
                   help="[grid] Ignore row bands thinner than this fraction of sheet height "
                        "(filters label strips). Default: 0.06")
    p.add_argument("--grid-min-col-frac", type=float, default=0.02,
                   help="[grid] Ignore column splits thinner than this fraction of sheet width. "
                        "Default: 0.02")
    p.add_argument("--pad", type=int, default=6,
                   help="Padding in px added around each crop. Default: 6")
    p.add_argument("--name-mode", choices=["position", "seq"], default="position",
                   help="File naming: 'position' -> <sheet>_r<row>c<col>.png (default), "
                        "'seq' -> <sheet>_<index>.png")
    p.add_argument("--debug", action="store_true",
                   help="Also write a <sheet>_DEBUG.png with detected boxes drawn on it.")
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    print("== crop_expression_sheets.py ==")
    total = 0
    for path in args.images:
        print(f"\n[sheet] {path}")
        total += process_sheet(path, args)
    print(f"\nDone. {total} crops written to {args.output!r}.")
    if total == 0:
        print("No regions found — try lowering --tol or --min-area-frac, "
              "or adjust --close. Use --debug to inspect detection.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
