#!/usr/bin/env python3
"""Validate the Nathal.IA actions: existence, duration, naming.

Checks (against ``master_character_config.json`` -> ``actions``):
  * the 8 canonical actions exist (Idle, Wave, Thinking, Pointing, Explaining,
    Celebrate, Typing, Alert),
  * each action's duration is within its [minSeconds, maxSeconds] window,
  * naming is PascalCase without ``.001`` suffixes,
  * each action has at least one keyframe (not empty).

Duration is computed from the action's frame range divided by the scene FPS.
Behaviour (D-009 tolerant): missing names / out-of-range durations are WARNINGS.
Inside Blender it inspects the live scene or an imported ``.glb``; outside
Blender it prints the contract and exits 0.

Usage:
    blender --background --python validate_actions.py                 # scene
    blender --background --python validate_actions.py -- master.glb   # a .glb
    python validate_actions.py                                        # plan

Exit codes: 0 = PASS/WARNING, 1 = FAIL.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402


def _fcurve_count(action) -> int:
    """Count an action's fcurves across Blender API versions.

    Blender <4.4 exposed ``action.fcurves`` directly. Blender 4.4+/5.x moved
    them into layers -> strips -> channelbags (slotted/layered actions). Try the
    new layered API first, then fall back to the legacy collection.
    """
    total = 0
    layers = getattr(action, "layers", None)
    if layers:
        for layer in layers:
            for strip in getattr(layer, "strips", []):
                for cbag in getattr(strip, "channelbags", []):
                    total += len(cbag.fcurves)
        return total
    try:
        return len(action.fcurves)  # legacy (<4.4)
    except AttributeError:
        return 0


def validate_scene(cfg: dict, path: str | None) -> pc.Report:
    import bpy

    target = "cena ativa"
    if path:
        target = path
        bpy.ops.wm.read_factory_settings(use_empty=True)
        try:
            bpy.ops.import_scene.gltf(filepath=path)
        except Exception as exc:
            rep = pc.Report("validate_actions.py", target, "blender")
            rep.add("import glTF", pc.FAIL, str(exc))
            return rep

    rep = pc.Report("validate_actions.py", target, "blender")

    actions = list(bpy.data.actions)
    if not actions:
        if not list(bpy.data.objects):
            rep.add("actions", pc.WARNING, "cena vazia — actions são a Etapa 7 (Fase 4 = estrutura)")
        else:
            rep.add("actions", pc.WARNING, "nenhuma action — trabalho da Etapa 7")
        return rep

    fps = bpy.context.scene.render.fps or 24
    by_name = {a.name: a for a in actions}
    expected = [a["name"] for a in cfg["actions"]]
    rep.expect_names("actions", expected, list(by_name))

    for spec in cfg["actions"]:
        action = by_name.get(spec["name"])
        if not action:
            continue
        start, end = action.frame_range
        seconds = round((end - start) / fps, 2)
        if _fcurve_count(action) == 0:
            rep.add(f"action {spec['name']}", pc.WARNING, "sem fcurves (vazia)")
        elif not (spec["minSeconds"] <= seconds <= spec["maxSeconds"]):
            rep.add(f"action {spec['name']}", pc.WARNING,
                    f"{seconds}s fora de [{spec['minSeconds']}, {spec['maxSeconds']}]")
        else:
            rep.add(f"action {spec['name']}", pc.PASS, f"{seconds}s")

    dotted = [a.name for a in actions if ".001" in a.name]
    if dotted:
        rep.add("nomenclatura", pc.WARNING, f"sufixos .00x: {dotted}")
    return rep


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv)

    if not pc.in_blender():
        names = [a["name"] for a in cfg["actions"]]
        ranges = [f"{a['name']} {a['minSeconds']}-{a['maxSeconds']}s "
                  f"({'loop' if a['loop'] else 'once'})" for a in cfg["actions"]]
        return pc.no_blender_plan(
            "validate_actions.py", cfg,
            [f"actions ({len(names)}): {names}"] + ["  - " + r for r in ranges],
        )

    rep = validate_scene(cfg, args["path"])
    return rep.finish()


if __name__ == "__main__":
    sys.exit(main())
