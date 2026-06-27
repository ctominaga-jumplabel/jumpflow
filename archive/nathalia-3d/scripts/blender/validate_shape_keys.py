#!/usr/bin/env python3
"""Validate the Nathal.IA shape keys: existence, names, duplicates.

Checks (against ``master_character_config.json`` -> ``shapeKeys``):
  * the 7 canonical shape keys exist (Smile, Blink_L, Blink_R, Thinking,
    Surprised, Sad, OpenMouth),
  * a ``Basis`` key block is present,
  * no duplicate / ``.001`` shape keys.

Behaviour (D-009 tolerant): missing/extra names are WARNINGS. Inside Blender it
inspects the live scene or an imported ``.glb``; outside Blender it prints the
contract and exits 0.

Usage:
    blender --background --python validate_shape_keys.py                 # scene
    blender --background --python validate_shape_keys.py -- master.glb   # a .glb
    python validate_shape_keys.py                                        # plan

Exit codes: 0 = PASS/WARNING, 1 = FAIL.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402


def validate_scene(cfg: dict, path: str | None) -> pc.Report:
    import bpy

    target = "cena ativa"
    if path:
        target = path
        bpy.ops.wm.read_factory_settings(use_empty=True)
        try:
            bpy.ops.import_scene.gltf(filepath=path)
        except Exception as exc:
            rep = pc.Report("validate_shape_keys.py", target, "blender")
            rep.add("import glTF", pc.FAIL, str(exc))
            return rep

    rep = pc.Report("validate_shape_keys.py", target, "blender")

    has_basis = False
    found: list[str] = []
    for mesh in bpy.data.meshes:
        if not mesh.shape_keys:
            continue
        for kb in mesh.shape_keys.key_blocks:
            if kb.name == "Basis":
                has_basis = True
            else:
                found.append(kb.name)

    if not found:
        if not list(bpy.data.objects):
            rep.add("shape keys", pc.WARNING, "cena vazia — shape keys são a Etapa 6 (Fase 4 = estrutura)")
        else:
            rep.add("shape keys", pc.WARNING, "nenhuma shape key — trabalho da Etapa 6")
        return rep

    rep.add("Basis", pc.PASS if has_basis else pc.WARNING,
            "presente" if has_basis else "ausente")
    rep.expect_names("shape keys", cfg["shapeKeys"], sorted(set(found)))

    # duplicates: same name twice, or Blender .001 suffixes.
    seen: set[str] = set()
    dups: list[str] = []
    for name in found:
        if name in seen or ".001" in name:
            dups.append(name)
        seen.add(name)
    if dups:
        rep.add("duplicatas", pc.WARNING, f"{sorted(set(dups))}")
    else:
        rep.add("duplicatas", pc.PASS, "nenhuma")
    return rep


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv)

    if not pc.in_blender():
        return pc.no_blender_plan(
            "validate_shape_keys.py", cfg,
            [
                f"shape keys ({len(cfg['shapeKeys'])}): {cfg['shapeKeys']}",
                "regras: Basis presente, sem duplicatas, valores 0..1",
            ],
        )

    rep = validate_scene(cfg, args["path"])
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
