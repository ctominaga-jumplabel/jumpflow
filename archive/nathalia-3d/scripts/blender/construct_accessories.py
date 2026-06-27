#!/usr/bin/env python3
"""Construct the official Nathal.IA accessory GLBs (Fase 7, Etapa 9).

Each accessory is a small, low-poly, self-contained ``.glb`` — NEVER embedded in
the master (D-001). They are loaded on demand at runtime and parented to a hand
bone or floated beside the character (see ACCESSORY_PIPELINE.md / ACCESSORY_RUNTIME.md).

Catalogue (ACCESSORIES.md): clipboard, clock, kanban, report, chart, approval_stamp.

Conventions:
  * file      : ``accessory-<key>.glb``           (e.g. accessory-clipboard.glb)
  * root obj  : ``Acc_<PascalKey>``               (e.g. Acc_Clipboard)
  * material  : ``MAT_Acc_<PascalKey>`` (+ accent mats local to that GLB)
  * scale     : 1 unit = 1 m; hand props ~0.15-0.25 m, scene props ~0.3-0.5 m
  * palette   : ink/white base + Jump orange accent; vivid colours only to
                encode meaning (green=ok, yellow/cyan=in-progress, coral=alert).

Usage:
    python construct_accessories.py                                  # plan
    blender --background --python construct_accessories.py            # dry-run
    blender --background --python construct_accessories.py -- --apply # build all

Exit codes: 0 = ok / dry-run, 1 = an export error.
"""
from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

# palette (sRGB hex) — mirrors CHARACTER_SHEET_PREMIUM / ACCESSORIES.
INK = "#111814"
OFFWHITE = "#ece9e0"
WHITE = "#ffffff"
ORANGE = "#ff7a18"
GREEN = "#32d583"
YELLOW = "#ffd43b"
CYAN = "#39c6d6"
CORAL = "#ff5a5f"
GREY = "#6b7280"

ACCESSORIES = ["clipboard", "clock", "kanban", "report", "chart", "approval_stamp"]


def _abs(rel: str) -> str:
    return rel if os.path.isabs(rel) else os.path.join(REPO_ROOT, rel)


def _pascal(key: str) -> str:
    return "".join(p.capitalize() for p in key.split("_"))


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_str: str):
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


# --------------------------------------------------------------------------- #
# Per-accessory builders. Each returns the root object name; the scene is reset
# before each so every GLB is independent.
# --------------------------------------------------------------------------- #
def _mat(name, hex_str, rough=0.6):
    import bpy
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    col = hex_to_linear(hex_str)
    if bsdf:
        bsdf.inputs["Base Color"].default_value = col
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = 0.0
    mat.diffuse_color = col
    return mat


def _box(loc, half, mat, rot=None):
    import bpy
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.active_object
    obj.scale = half
    if rot is not None:
        obj.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def _cyl(loc, r, depth, mat, rot=None, verts=24):
    import bpy
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth,
                                        location=loc)
    obj = bpy.context.active_object
    if rot is not None:
        obj.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return obj


def _finish(parts, root_name):
    import bpy
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = root_name
    obj.data.name = root_name + "_mesh"
    bpy.ops.object.shade_flat()
    return obj


def build_clipboard(base):
    board = _box((0, 0, 0), (0.085, 0.005, 0.115), base)          # plate
    clip = _box((0, -0.006, 0.108), (0.03, 0.008, 0.012),
                _mat("MAT_Acc_ClipMetal", GREY, 0.4))             # clip
    parts = [board, clip]
    green = _mat("MAT_Acc_ClipCheck", GREEN, 0.5)
    for i, z in enumerate((0.05, 0.0, -0.05)):                    # rows / checks
        parts.append(_box((-0.05, -0.007, z), (0.012, 0.004, 0.012),
                          green if i < 2 else base))
        parts.append(_box((0.01, -0.007, z), (0.045, 0.003, 0.004),
                          _mat(f"MAT_Acc_ClipLine{i}", INK, 0.7)))
    return _finish(parts, "Acc_Clipboard")


def build_clock(base):
    ring = _cyl((0, 0, 0), 0.10, 0.022, _mat("MAT_Acc_ClockRing", INK, 0.5),
                rot=(math.radians(90), 0, 0))
    face = _cyl((0, -0.012, 0), 0.085, 0.006, base,
                rot=(math.radians(90), 0, 0))
    hour = _box((0, -0.02, 0.018), (0.008, 0.004, 0.04),
                _mat("MAT_Acc_ClockHand", INK, 0.5))
    minute = _box((0.03, -0.02, 0), (0.05, 0.004, 0.007),
                  _mat("MAT_Acc_ClockHand2", INK, 0.5))
    sec = _box((0, -0.024, -0.02), (0.004, 0.003, 0.055),
               _mat("MAT_Acc_ClockSec", ORANGE, 0.5),
               rot=(0, math.radians(20), 0))
    return _finish([ring, face, hour, minute, sec], "Acc_Clock")


def build_kanban(base):
    board = _box((0, 0, 0), (0.22, 0.008, 0.16), base)
    parts = [board]
    cols = [GREY, CYAN, GREEN]
    cards = {0: [GREY, GREY], 1: [CYAN, YELLOW], 2: [GREEN]}
    for c in range(3):
        x = -0.14 + c * 0.14
        parts.append(_box((x, -0.01, 0.13), (0.05, 0.004, 0.012),
                          _mat(f"MAT_Acc_KbHead{c}", cols[c], 0.5)))
        for j, col in enumerate(cards[c]):
            parts.append(_box((x, -0.012, 0.06 - j * 0.06), (0.05, 0.006, 0.022),
                              _mat(f"MAT_Acc_KbCard{c}{j}", col, 0.55)))
    return _finish(parts, "Acc_Kanban")


def build_report(base):
    sheet = _box((0, 0, 0), (0.09, 0.004, 0.12), base)
    parts = [sheet]
    bars = [(0.04, GREEN), (0.06, ORANGE), (0.03, CYAN)]           # mini chart
    for i, (h, col) in enumerate(bars):
        parts.append(_box((-0.05 + i * 0.035, -0.006, 0.06 + h / 2 - 0.04),
                          (0.012, 0.004, h),
                          _mat(f"MAT_Acc_RepBar{i}", col, 0.55)))
    for i in range(4):                                            # text lines
        parts.append(_box((0, -0.006, 0.0 - i * 0.025), (0.06, 0.003, 0.004),
                          _mat(f"MAT_Acc_RepLine{i}", GREY, 0.7)))
    return _finish(parts, "Acc_Report")


def build_chart(base):
    heights = [0.10, 0.16, 0.13, 0.22]
    cols = [INK, INK, INK, ORANGE]
    parts = []
    for i, (h, col) in enumerate(zip(heights, cols)):
        m = base if col == INK else _mat("MAT_Acc_ChartHi", ORANGE, 0.5)
        parts.append(_box((-0.12 + i * 0.08, 0, h / 2), (0.03, 0.03, h / 2), m))
    parts.append(_box((0, 0, -0.01), (0.18, 0.04, 0.008),
                      _mat("MAT_Acc_ChartBase", GREY, 0.7)))        # baseline
    return _finish(parts, "Acc_Chart")


def build_approval_stamp(base):
    handle = _cyl((0, 0, 0.10), 0.022, 0.09, base, verts=16)
    knob = _cyl((0, 0, 0.155), 0.04, 0.03, base, verts=16)
    neck = _cyl((0, 0, 0.045), 0.03, 0.03, base, verts=16)
    pad = _cyl((0, 0, 0.01), 0.06, 0.025,
               _mat("MAT_Acc_StampInk", GREEN, 0.5), verts=20)
    check = _box((0, 0, -0.004), (0.03, 0.03, 0.006),
                 _mat("MAT_Acc_StampCheck", WHITE, 0.6),
                 rot=(0, 0, math.radians(45)))
    return _finish([handle, knob, neck, pad, check], "Acc_ApprovalStamp")


BUILDERS = {
    "clipboard": (build_clipboard, OFFWHITE),
    "clock": (build_clock, WHITE),
    "kanban": (build_kanban, INK),
    "report": (build_report, OFFWHITE),
    "chart": (build_chart, INK),
    "approval_stamp": (build_approval_stamp, INK),
}


def _export(key, out_dir) -> str:
    import bpy
    out = os.path.join(out_dir, f"accessory-{key}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_image_format="NONE",
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_animations=False,
        export_morph=False,
    )
    return out


def _build_all(cfg) -> int:
    import bpy
    out_dir = _abs(cfg["paths"].get(
        "accessoriesDir",
        "packages/character-nathalia/assets/models/accessories"))
    os.makedirs(out_dir, exist_ok=True)

    for key in ACCESSORIES:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system = "METRIC"
        builder, base_hex = BUILDERS[key]
        base_mat = _mat(f"MAT_Acc_{_pascal(key)}", base_hex)
        root = builder(base_mat)
        # normalise: object origin to geometry, sit on local origin
        bpy.ops.object.select_all(action="DESELECT")
        root.select_set(True)
        bpy.context.view_layer.objects.active = root
        bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
        root.location = (0, 0, 0)
        out = _export(key, out_dir)
        size_kb = round(os.path.getsize(out) / 1024, 1)
        tris = sum(len(p.vertices) - 2 for p in root.data.polygons)
        print(f"  {key:>15} -> {os.path.basename(out)}  ({size_kb} KB, ~{tris} tris)")
    print(f"\n6 acessórios exportados em: {out_dir}")
    return 0


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv, flags=("--apply",))

    if not pc.in_blender():
        print("== construct_accessories.py (sem Blender) ==")
        print("Acessórios oficiais:", ACCESSORIES)
        for key in ACCESSORIES:
            print(f"  accessory-{key}.glb  (root Acc_{_pascal(key)}, "
                  f"mat MAT_Acc_{_pascal(key)})")
        print("\nRode com Blender + --apply para gerar os .glb.")
        return 0

    if not args["apply"]:
        print("Dry-run dentro do Blender (sem --apply). Nada foi exportado.")
        return 0

    print("== construct_accessories.py (APPLY) ==")
    return _build_all(cfg)


if __name__ == "__main__":
    sys.exit(main())
