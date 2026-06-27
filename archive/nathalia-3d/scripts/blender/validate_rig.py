#!/usr/bin/env python3
"""Validate the Nathal.IA rig: armature, bone names and hierarchy.

Checks (against ``master_character_config.json`` -> ``rigBones`` / ``rigHierarchy``):
  * exactly one Armature exists,
  * the 16 canonical bones are present (Pelvis ... Foot.L/R),
  * each bone's parent matches the canonical hierarchy.

Behaviour (D-009 tolerant): missing/extra bones are WARNINGS (extras such as
optional hair bones are allowed); only "no armature in a populated scene" is a
hard signal worth flagging. Inside Blender it inspects the live scene or an
imported ``.glb``; outside Blender it prints the contract and exits 0.

Usage:
    blender --background --python validate_rig.py                 # live scene
    blender --background --python validate_rig.py -- master.glb   # a .glb
    python validate_rig.py                                        # plan only

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
            rep = pc.Report("validate_rig.py", target, "blender")
            rep.add("import glTF", pc.FAIL, str(exc))
            return rep

    rep = pc.Report("validate_rig.py", target, "blender")

    armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
    if not armatures:
        if not list(bpy.data.objects):
            rep.add("armature", pc.WARNING, "cena vazia — rig ainda não construído (Fase 4 = estrutura)")
        else:
            rep.add("armature", pc.WARNING, "nenhum armature — rig é trabalho da Etapa 5")
        return rep

    if len(armatures) > 1:
        rep.add("armature", pc.WARNING, f"{len(armatures)} armatures (esperado 1)")
    else:
        rep.add("armature", pc.PASS, armatures[0].name)

    bones = {b.name: (b.parent.name if b.parent else None)
             for arm in armatures for b in arm.data.bones}
    rep.expect_names("bones", cfg["rigBones"], list(bones))

    # hierarchy: each declared child must have the declared parent.
    hierarchy = cfg.get("rigHierarchy", {})
    mismatches: list[str] = []
    for parent, children in hierarchy.items():
        for child in children:
            if child in bones and bones[child] != parent:
                mismatches.append(f"{child}->{bones[child] or 'None'} (esperado {parent})")
    if mismatches:
        rep.add("hierarquia", pc.WARNING, "; ".join(mismatches))
    else:
        rep.add("hierarquia", pc.PASS, "pais conferem")

    dotted = [b for b in bones if ".001" in b]
    if dotted:
        rep.add("nomenclatura", pc.WARNING, f"sufixos .00x: {dotted}")
    return rep


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv)

    if not pc.in_blender():
        return pc.no_blender_plan(
            "validate_rig.py", cfg,
            [
                f"armature: {cfg['rig']}",
                f"bones ({len(cfg['rigBones'])}): {cfg['rigBones']}",
                "hierarquia: ver RIG_BLUEPRINT.md / rigHierarchy",
            ],
        )

    rep = validate_scene(cfg, args["path"])
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
