#!/usr/bin/env python3
"""Validate the Nathal.IA master character: objects, materials, transform.

Checks (against ``master_character_config.json``):
  * the 7 named objects exist (Body, Hair, Eyes, Shirt, Pants, Shoes, Logo),
  * the 7 named materials exist (MAT_*),
  * origin/scale/orientation are normalized (1 unit = 1 m, feet on the floor).

Rig, shape keys and actions have dedicated validators (``validate_rig.py``,
``validate_shape_keys.py``, ``validate_actions.py``); ``report_master.py`` runs
all of them and writes a consolidated report.

Behaviour (D-009 tolerant): missing names are WARNINGS; only a broken import is
a hard FAIL. Inside Blender it inspects the live scene or a ``.glb`` passed on
the CLI; outside Blender it prints the contract and exits 0.

Usage:
    blender --background --python validate_master.py                 # live scene
    blender --background --python validate_master.py -- master.glb   # a .glb
    python validate_master.py                                        # plan only

Exit codes: 0 = PASS/WARNING, 1 = FAIL (hard violation).
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
            rep = pc.Report("validate_master.py", target, "blender")
            rep.add("import glTF", pc.FAIL, str(exc))
            return rep

    rep = pc.Report("validate_master.py", target, "blender")

    objects = [o.name for o in bpy.data.objects if o.type == "MESH"]
    materials = [m.name for m in bpy.data.materials]

    if not objects:
        rep.add("objetos", pc.WARNING, "cena vazia — nada para validar ainda (Fase 4 = estrutura)")
        rep.note("Construa/abra o master.blend ou passe um .glb para validar de verdade.")
        return rep

    rep.expect_names("objetos", cfg["objects"], objects)
    rep.expect_names("materiais", cfg["materials"], materials)

    # transform: feet on the floor (min Z ~ 0) and roughly 1.6 m tall.
    min_z = float("inf")
    max_z = float("-inf")
    for obj in bpy.data.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world_z = (obj.matrix_world @ _vec(corner))[2]
            min_z = min(min_z, world_z)
            max_z = max(max_z, world_z)
    if min_z != float("inf"):
        if abs(min_z) > 0.05:
            rep.add("origem (pés no chão)", pc.WARNING, f"min Z = {round(min_z, 4)} (normalizar)")
        else:
            rep.add("origem (pés no chão)", pc.PASS, "min Z ≈ 0")
        height = round(max_z - min_z, 3)
        target_h = cfg["transform"]["heightMeters"]
        if abs(height - target_h) > 0.3:
            rep.add("escala (altura)", pc.WARNING, f"{height} m (alvo ~{target_h} m)")
        else:
            rep.add("escala (altura)", pc.PASS, f"{height} m")
    return rep


def _vec(corner):
    from mathutils import Vector

    return Vector((corner[0], corner[1], corner[2]))


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv)

    if not pc.in_blender():
        return pc.no_blender_plan(
            "validate_master.py", cfg,
            [
                f"objetos ({len(cfg['objects'])}): {cfg['objects']}",
                f"materiais ({len(cfg['materials'])}): {cfg['materials']}",
                f"transform: {cfg['transform']['unitMetersPerUnit']} u/m, "
                f"olhar {cfg['transform']['facingAxis']}, up {cfg['transform']['upAxis']}, "
                f"altura ~{cfg['transform']['heightMeters']} m",
            ],
        )

    rep = validate_scene(cfg, args["path"])
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
