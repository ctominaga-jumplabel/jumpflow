#!/usr/bin/env python3
"""Catalog the Nathal.IA 2D image assets into a machine- and frontend-readable
manifest.

This is the entry point of the 2D layered-avatar pipeline (see
``docs/nathalia/2D_ANIMATION_ARCHITECTURE.md``). It scans the known asset
locations, classifies each image by filename heuristics, measures it with
Pillow (size, transparency, bytes) and writes:

  * ``packages/character-nathalia/assets/2d/catalog.json``      (canonical data)
  * ``packages/character-nathalia/src/nathaliaSpriteCatalog.generated.ts``
        (typed data module — no JSON-import/bundler coupling)

It never modifies the source images and is safe to re-run (idempotent output,
stable ordering, no timestamps so git diffs stay clean).

Usage:
    python scripts/nathalia/2d/catalog_assets.py [--check]

    --check   exit 1 if the generated files would change (CI guard); writes
              nothing.

Exit codes: 0 = ok, 1 = drift (with --check) / Pillow missing, 2 = bad args.
"""
from __future__ import annotations

import json
import os
import sys

try:
    from PIL import Image
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write(
        "Pillow is required: pip install Pillow\n"
        "(the rest of the Nathal.IA pipeline uses it too)\n"
    )
    sys.exit(1)

HERE = os.path.dirname(os.path.abspath(__file__))
# scripts/nathalia/2d/ -> repo root is three levels up.
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

PKG = os.path.join(REPO_ROOT, "packages", "character-nathalia")
ASSETS_2D = os.path.join(PKG, "assets", "2d")
CATALOG_JSON = os.path.join(ASSETS_2D, "catalog.json")
GENERATED_TS = os.path.join(PKG, "src", "nathaliaSpriteCatalog.generated.ts")

IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif")

# Known taxonomy, mirrored from packages/character-nathalia/src/nathaliaExpressions.ts.
# Kept here as plain data so the script has no TS dependency; the catalog.json is
# the contract checked by the frontend, not this list.
EXPRESSIONS = {
    "preocupada", "alerta", "comemorando", "empolgada", "pensativa", "curiosa",
    "surpresa", "confiante", "satisfeita", "grata", "animada", "triste",
    "zangada", "focada", "eureka", "duvida", "encorajando",
}
VISEMES = {"a", "e", "i", "o", "u", "s", "m", "l", "fv", "r", "tdn", "rest"}
OBJECTS = {"horas", "projetos", "aprovacoes", "relatorios"}
EYES = {"open", "closed"}

ORIENTATION_TOKENS = {
    "front": "front", "frente": "front",
    "left": "left", "esquerd": "left",
    "right": "right", "direit": "right",
    "back": "back", "costas": "back",
    "side": "side", "lado": "side",
}

# Scan roots, each as (label, abs-path, web-base-or-None). ``webBase`` is the URL
# prefix when the asset is served statically; None means source-only (not served).
def scan_roots() -> list[tuple[str, str, str | None]]:
    return [
        ("production", os.path.join(REPO_ROOT, "apps", "web", "public", "nathalia", "expressions"), "/nathalia/expressions"),
        ("runtime-layers", os.path.join(REPO_ROOT, "apps", "web", "public", "nathalia", "layers"), "/nathalia/layers"),
        ("layers", os.path.join(ASSETS_2D, "layers"), None),
        ("source", os.path.join(ASSETS_2D, "source"), None),
        ("curated", os.path.join(REPO_ROOT, "scripts", "nathalia", "nathalia_curated"), None),
        ("sheets", os.path.join(REPO_ROOT, "scripts", "nathalia", "cropped_sheets"), None),
    ]


def detect_orientation(name: str) -> str | None:
    low = name.lower()
    for token, orient in ORIENTATION_TOKENS.items():
        if token in low:
            return orient
    return None


def classify(name: str, root_label: str) -> dict:
    """Return {category, subCategory, orientation, expression, suggestedUse}."""
    stem = os.path.splitext(name)[0]
    low = stem.lower()

    if low.startswith("base-") or low == "face-base":
        orientation = detect_orientation(low) or "front"
        return {
            "category": "face_base",
            "subCategory": orientation,
            "orientation": orientation,
            "expression": None,
            "suggestedUse": "neutral face base for separated eye/mouth overlays",
        }

    if low.startswith("eyes-"):
        e = low[5:]
        return {
            "category": "eye",
            "subCategory": e if e in EYES else "unknown",
            "orientation": None,
            "expression": None,
            "suggestedUse": "transparent eye overlay for blink states",
        }

    if low.startswith("mouth-"):
        m = low[6:]
        return {
            "category": "mouth",
            "subCategory": m if m in VISEMES else "unknown",
            "orientation": None,
            "expression": None,
            "suggestedUse": "transparent mouth overlay for layered lip-sync",
        }

    # Visemes: vis-a.webp ...
    if low.startswith("vis-"):
        v = low[4:]
        return {
            "category": "viseme",
            "subCategory": v if v in VISEMES else "unknown",
            "orientation": None,
            "expression": None,
            "suggestedUse": "lip-sync mouth frame (talking state)",
        }

    # Context object icons: icon-horas.webp ...
    if low.startswith("icon-"):
        o = low[5:]
        return {
            "category": "object",
            "subCategory": o if o in OBJECTS else "unknown",
            "orientation": None,
            "expression": None,
            "suggestedUse": "context badge overlay",
        }

    # Named expression bust: pensativa.webp ...
    if low in EXPRESSIONS:
        return {
            "category": "expression",
            "subCategory": low,
            "orientation": None,
            "expression": low,
            "suggestedUse": "primary face layer for matching state/context",
        }

    orientation = detect_orientation(low)
    if orientation is not None:
        return {
            "category": "body",
            "subCategory": orientation,
            "orientation": orientation,
            "expression": None,
            "suggestedUse": "full-body base layer (orientation)",
        }

    # Curated/cropped face crops (e.g. *_r01c02_face3, NathalIA_faces_*).
    if "face" in low or root_label in ("curated", "sheets"):
        return {
            "category": "face",
            "subCategory": "crop",
            "orientation": None,
            "expression": None,
            "suggestedUse": "raw face crop — candidate source for an expression",
        }

    return {
        "category": "source",
        "subCategory": "sheet",
        "orientation": None,
        "expression": None,
        "suggestedUse": "original sprite sheet / source art",
    }


def measure(path: str) -> dict:
    with Image.open(path) as im:
        width, height = im.size
        has_alpha = im.mode in ("RGBA", "LA") or (
            im.mode == "P" and "transparency" in im.info
        )
        if has_alpha and im.mode != "RGBA":
            im = im.convert("RGBA")
        # A palette/transparency flag can lie; confirm a truly transparent pixel
        # exists for RGBA images (cheap getextrema on alpha band).
        if im.mode == "RGBA":
            alpha_min = im.getchannel("A").getextrema()[0]
            has_alpha = alpha_min < 255
    return {"width": width, "height": height, "hasAlpha": bool(has_alpha)}


def rel(path: str) -> str:
    return os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")


def build_catalog() -> dict:
    assets: list[dict] = []
    # Files served from production (the runtime source of truth). The `layers/`
    # tree holds *copies* of these for the organized library, so we skip a layer
    # file whose basename is already served — only genuinely new layer art
    # (future body/poses) is counted, never double-counted.
    prod_root = os.path.join(REPO_ROOT, "apps", "web", "public", "nathalia", "expressions")
    served_names = set()
    if os.path.isdir(prod_root):
        served_names = {
            fn for fn in os.listdir(prod_root) if fn.lower().endswith(IMAGE_EXTS)
        }
    served_layer_root = os.path.join(REPO_ROOT, "apps", "web", "public", "nathalia", "layers")
    served_layer_paths = set()
    if os.path.isdir(served_layer_root):
        for dirpath, _dirs, files in os.walk(served_layer_root):
            for fn in files:
                if fn.lower().endswith(IMAGE_EXTS):
                    served_layer_paths.add(
                        os.path.relpath(os.path.join(dirpath, fn), served_layer_root).replace(os.sep, "/")
                    )

    for label, root, web_base in scan_roots():
        if not os.path.isdir(root):
            continue
        for dirpath, _dirs, files in os.walk(root):
            for fn in sorted(files):
                if not fn.lower().endswith(IMAGE_EXTS):
                    continue
                full = os.path.join(dirpath, fn)
                if fn.startswith("_") or "_DEBUG" in fn:
                    # internal audit/debug renders — not real character layers
                    continue
                if label == "layers":
                    layer_rel = os.path.relpath(full, root).replace(os.sep, "/")
                    if fn in served_names or layer_rel in served_layer_paths:
                        # copy of a served asset — already cataloged from public runtime roots
                        continue
                cls = classify(fn, label)
                try:
                    dim = measure(full)
                except Exception as exc:  # noqa: BLE001 - never silently pass
                    dim = {"width": 0, "height": 0, "hasAlpha": False}
                    cls["suggestedUse"] += f" (unreadable: {exc})"
                if web_base is not None:
                    web_rel = os.path.relpath(full, root).replace(os.sep, "/")
                    web_url = f"{web_base}/{web_rel}"
                else:
                    web_url = None
                assets.append({
                    "fileName": fn,
                    "path": rel(full),
                    "webUrl": web_url,
                    "rootLabel": label,
                    "category": cls["category"],
                    "subCategory": cls["subCategory"],
                    "orientation": cls["orientation"],
                    "expression": cls["expression"],
                    "suggestedUse": cls["suggestedUse"],
                    "width": dim["width"],
                    "height": dim["height"],
                    "hasAlpha": dim["hasAlpha"],
                    "bytes": os.path.getsize(full),
                    "notes": "",
                })

    # Stable ordering: category, then path.
    assets.sort(key=lambda a: (a["category"], a["path"]))

    by_category: dict[str, int] = {}
    for a in assets:
        by_category[a["category"]] = by_category.get(a["category"], 0) + 1

    # Layer-presence summary the frontend uses to decide compositing vs fallback.
    populated = {c for c, n in by_category.items() if n > 0}
    layers_present = {
        "body": "body" in populated,
        "faceBase": "face_base" in populated,
        "face": "expression" in populated or "face" in populated,
        "eyes": "eye" in populated,
        "mouths": "mouth" in populated,
        "visemes": "viseme" in populated,
        "objects": "object" in populated,
        "poses": False,  # no pose art yet — kept explicit for future generation
        "accessories": False,
    }

    return {
        "schemaVersion": 1,
        "generatedBy": "scripts/nathalia/2d/catalog_assets.py",
        "note": (
            "Catálogo de assets 2D da Nathal.IA. Hoje populado para face/"
            "expressões/visemas/objetos; corpo/orientações/poses pendentes de "
            "geração de arte (ver docs/nathalia/NEXT_STEPS_LIVE2D.md)."
        ),
        "counts": {"total": len(assets), "byCategory": dict(sorted(by_category.items()))},
        "layersPresent": layers_present,
        "assets": assets,
    }


def ts_module(catalog: dict) -> str:
    # The runtime module only needs the *served* sprites (those with a webUrl);
    # the 100+ source-only face crops stay in catalog.json for traceability but
    # would only bloat the client bundle. Counts/layersPresent stay from the
    # full catalog so layer-presence checks remain accurate.
    runtime = {
        "schemaVersion": catalog["schemaVersion"],
        "counts": catalog["counts"],
        "layersPresent": catalog["layersPresent"],
        "assets": [a for a in catalog["assets"] if a.get("webUrl")],
    }
    payload = json.dumps(runtime, ensure_ascii=False, indent=2)
    return (
        "/* AUTO-GENERATED by scripts/nathalia/2d/catalog_assets.py — do not edit.\n"
        " * Run `python scripts/nathalia/2d/catalog_assets.py` to regenerate.\n"
        " * Holds only the *served* sprites; full inventory is in assets/2d/catalog.json.\n"
        " * Consumed (with types/helpers) by ./nathaliaSpriteCatalog.ts. */\n"
        "/* eslint-disable */\n"
        "// prettier-ignore\n"
        f"export const NATHALIA_SPRITE_CATALOG = {payload} as const;\n"
    )


def write_or_check(path: str, content: str, check: bool) -> bool:
    """Return True if content matches on disk (or was written)."""
    existing = None
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8", newline="") as fh:
            existing = fh.read()
    if existing == content:
        return True
    if check:
        sys.stderr.write(f"DRIFT: {rel(path)} is out of date\n")
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(content)
    sys.stderr.write(f"wrote {rel(path)}\n")
    return True


def main(argv: list[str]) -> int:
    check = "--check" in argv[1:]
    unknown = [a for a in argv[1:] if a not in ("--check",)]
    if unknown:
        sys.stderr.write(f"unknown args: {unknown}\n")
        return 2

    catalog = build_catalog()
    json_content = json.dumps(catalog, ensure_ascii=False, indent=2) + "\n"
    ok_json = write_or_check(CATALOG_JSON, json_content, check)
    ok_ts = write_or_check(GENERATED_TS, ts_module(catalog), check)

    c = catalog["counts"]
    sys.stderr.write(
        f"\ncatalog: {c['total']} assets — "
        + ", ".join(f"{k}={v}" for k, v in c["byCategory"].items())
        + "\n"
    )
    lp = catalog["layersPresent"]
    sys.stderr.write(
        "layers: " + ", ".join(f"{k}={'yes' if v else 'no'}" for k, v in lp.items()) + "\n"
    )

    if check and not (ok_json and ok_ts):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
