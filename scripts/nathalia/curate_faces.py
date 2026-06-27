#!/usr/bin/env python3
"""Curate raw Nathal.IA crops into useful single-character images.

Takes the crops produced by ``crop_expression_sheets.py`` and, for each one,
decides via OpenCV whether it is a Nathal.IA character image or just text, how
many faces it holds, and acts:

  * Pure text / UI cards  -> dropped (not copied to the curated folder).
  * Exactly one face      -> kept as-is (already a useful bust).
  * Two or more faces     -> split into one bust per face (works for a row of
                             busts and for a 2D grid panel alike).
  * No face but a large    -> kept (profile / back-of-head turnaround views that
    character silhouette      a frontal detector can't see, but are not text).

Classification signals (no ML download required):
  * Haar frontal-face cascade bundled with OpenCV detects these stylised
    3D-cartoon faces reliably (verified on the Nathal.IA sheets).
  * "Text vs character" for 0-face crops uses the largest connected foreground
    component as a fraction of area: a character is one big silhouette (>=0.20),
    a text card is scattered thin strokes (<=0.11 in practice).

Multi-face splitting expands each detected face box into a bust (extra room for
hair above and shoulders below), then clamps every edge to the midpoint toward
any neighbouring face so a slice never swallows the next character.

Usage:
    python curate_faces.py SRC_DIR -o OUT_DIR [--delete-text] [--debug]

    SRC_DIR        folder of raw crops (e.g. cropped_sheets)
    -o/--output    curated output folder (default: <SRC_DIR>/curated)
    --delete-text  also delete the text-only files from SRC_DIR
    --debug        print the per-file decision table

Dependencies:  pip install opencv-python numpy
"""
from __future__ import annotations

import argparse
import glob
import os
import shutil
import sys
from typing import List, Tuple

import cv2
import numpy as np

Box = Tuple[int, int, int, int]

CC_CHARACTER_MIN = 0.20  # largest-CC fraction above which a 0-face crop is a character
BG_TOL = 28


def estimate_bg(img: np.ndarray, border: int = 8) -> np.ndarray:
    h, w = img.shape[:2]
    b = max(1, min(border, h // 2, w // 2))
    s = np.concatenate([
        img[:b].reshape(-1, 3), img[-b:].reshape(-1, 3),
        img[:, :b].reshape(-1, 3), img[:, -b:].reshape(-1, 3),
    ])
    return np.median(s, axis=0)


def largest_cc_fraction(img: np.ndarray) -> float:
    diff = np.abs(img.astype(np.int16) - estimate_bg(img).astype(np.int16)).max(axis=2)
    mask = (diff > BG_TOL).astype(np.uint8)
    # Only denoise — do NOT close. Closing would fuse separate text glyphs into
    # one blob and make a logo/label look like a solid character silhouette.
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN,
                            cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return 0.0
    biggest = stats[1:, cv2.CC_STAT_AREA].max()
    return float(biggest) / (img.shape[0] * img.shape[1])


def detect_faces(img: np.ndarray, cas: cv2.CascadeClassifier) -> List[Box]:
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    faces = cas.detectMultiScale(gray, 1.1, 5, minSize=(45, 45))
    return [tuple(int(v) for v in f) for f in faces]


def bust_boxes(faces: List[Box], img_w: int, img_h: int) -> List[Box]:
    """Expand each face box into a neighbour-aware bust crop."""
    centers = [(x + w / 2, y + h / 2) for (x, y, w, h) in faces]
    out: List[Box] = []
    for i, (x, y, w, h) in enumerate(faces):
        cx, cy = centers[i]
        left, right = cx - w * 1.15, cx + w * 1.15
        top, bot = cy - h * 1.25, cy + h * 1.9  # extra hair above, shoulders below
        for j, (ox, oy) in enumerate(centers):
            if j == i:
                continue
            dx, dy = ox - cx, oy - cy
            if abs(dx) >= abs(dy):  # horizontal neighbour -> clamp side
                mid = (cx + ox) / 2
                if dx > 0:
                    right = min(right, mid)
                else:
                    left = max(left, mid)
            else:  # vertical neighbour -> clamp top/bottom
                mid = (cy + oy) / 2
                if dy > 0:
                    bot = min(bot, mid)
                else:
                    top = max(top, mid)
        x0, y0 = max(0, int(left)), max(0, int(top))
        x1, y1 = min(img_w, int(right)), min(img_h, int(bot))
        if x1 - x0 > 10 and y1 - y0 > 10:
            out.append((x0, y0, x1 - x0, y1 - y0))
    return out


def classify(img: np.ndarray, cas: cv2.CascadeClassifier):
    faces = detect_faces(img, cas)
    if len(faces) >= 2:
        return "split", faces
    if len(faces) == 1:
        return "single", faces
    if largest_cc_fraction(img) >= CC_CHARACTER_MIN:
        return "character_noface", faces
    return "text", faces


def parse_args(argv: List[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Curate Nathal.IA crops into useful single images.")
    p.add_argument("src", help="Folder of raw crops.")
    p.add_argument("-o", "--output", default=None, help="Curated output folder.")
    p.add_argument("--delete-text", action="store_true",
                   help="Also delete text-only files from the source folder.")
    p.add_argument("--debug", action="store_true", help="Print the decision table.")
    return p.parse_args(argv)


def main(argv: List[str]) -> int:
    args = parse_args(argv)
    out_dir = args.output or os.path.join(args.src, "curated")
    os.makedirs(out_dir, exist_ok=True)
    cas = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    files = sorted(f for f in glob.glob(os.path.join(args.src, "*.png"))
                   if "DEBUG" not in os.path.basename(f))
    counts = {"single": 0, "split": 0, "character_noface": 0, "text": 0}
    produced = 0
    deleted: List[str] = []

    for f in files:
        img = cv2.imread(f, cv2.IMREAD_COLOR)
        if img is None:
            continue
        h, w = img.shape[:2]
        action, faces = classify(img, cas)
        counts[action] += 1
        stem = os.path.splitext(os.path.basename(f))[0]

        if args.debug:
            print(f"  {action:17s} faces={len(faces)}  {os.path.basename(f)}")

        if action == "text":
            deleted.append(f)
            if args.delete_text:
                os.remove(f)
            continue

        if action in ("single", "character_noface"):
            shutil.copy2(f, os.path.join(out_dir, f"{stem}.png"))
            produced += 1
            continue

        # split: order faces left-to-right, top-to-bottom for stable numbering
        ordered = sorted(faces, key=lambda b: (round(b[1] / 80), b[0]))
        for k, box in enumerate(bust_boxes(ordered, w, h)):
            bx, by, bw, bh = box
            cv2.imwrite(os.path.join(out_dir, f"{stem}_face{k}.png"),
                        img[by:by + bh, bx:bx + bw])
            produced += 1

    print("\n== curate_faces.py ==")
    print(f"source : {args.src}")
    print(f"output : {out_dir}")
    print(f"inputs : {len(files)}  -> "
          f"single={counts['single']} split={counts['split']} "
          f"profile/back={counts['character_noface']} text={counts['text']}")
    print(f"useful images produced: {produced}")
    if deleted:
        verb = "deleted from source" if args.delete_text else "classified as text (not copied)"
        print(f"text crops {verb}: {len(deleted)}")
        for d in deleted:
            print(f"  - {os.path.basename(d)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
