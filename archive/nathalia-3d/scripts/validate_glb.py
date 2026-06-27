#!/usr/bin/env python3
"""Validate a Nathal.IA .glb against the asset contract.

Source of truth for expected names/limits is ``nathalia_assets.config.json``
(which mirrors ``docs/nathalia/GLB_REQUIREMENTS.md``). All measurement and
judgement live in ``glb_metrics.py`` so this script, ``inspect_glb.py`` and
``generate_asset_report.py`` stay consistent.

Behaviour:
  * **Inside Blender** (``bpy`` available): full validation — geometry, rig,
    shape keys, dimensions, polycount.
  * **Outside Blender**: structural validation from the .glb JSON chunk
    (counts/names/file-size). Geometry-only checks (polycount, dimensions) are
    skipped with a clear note — never a silent pass.
  * Tolerant (D-009): name mismatches are WARNINGS. Only hard violations
    (invalid glTF, polycount over the hard max) fail.

Usage:
    blender --background --python validate_glb.py -- <path-to.glb> [--strict]
    python validate_glb.py <path-to.glb>            # structural validation

Exit codes: 0 = ok, 1 = hard violation / file missing, 2 = bad arguments.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import glb_metrics as gm  # noqa: E402


def parse_args(argv: list[str]) -> dict:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = argv[1:]
    path = None
    strict = False
    for arg in argv:
        if arg == "--strict":
            strict = True
        elif not arg.startswith("--") and path is None:
            path = arg
    return {"path": path, "strict": strict}


def print_metrics(metrics: dict) -> None:
    c = metrics["counts"]
    print(f"== validate_glb.py ({metrics['mode']}) :: {metrics['fileName']} ==")
    print(f"  file size   : {metrics['fileSizeHuman']}")

    def show(label: str, value) -> None:
        print(f"  {label:<12}: {'?' if value is None else value}")

    show("objects", c["objects"])
    show("meshes", c["meshes"])
    show("materials", c["materials"])
    show("triangles", c["triangles"])
    show("vertices", c["vertices"])
    show("animations", c["animations"])
    show("shapeKeys", c["shapeKeys"])
    show("textures", c["textures"])
    print(f"  rig         : {_yn(metrics['hasRig'])}")
    print(f"  animations? : {_yn(metrics['hasAnimations'])}")
    print(f"  shapeKeys?  : {_yn(metrics['hasShapeKeys'])}")
    if metrics.get("dimensions"):
        d = metrics["dimensions"]
        print(f"  dimensions  : x={d['x']} y={d['y']} z={d['z']} (Blender units)")
    if metrics["materialsList"]:
        print(f"  materials   : {metrics['materialsList']}")
    if metrics["objectsList"]:
        print(f"  objects     : {metrics['objectsList']}")
    if metrics["animationsList"]:
        print(f"  anim list   : {metrics['animationsList']}")
    if metrics["shapeKeysList"]:
        print(f"  shapekeys   : {metrics['shapeKeysList']}")
    if metrics["armatureBones"]:
        print(f"  rig bones   : {metrics['armatureBones']}")
    for note in metrics["notes"]:
        print(f"  note        : {note}")


def _yn(value) -> str:
    if value is None:
        return "?"
    return "yes" if value else "no"


def dry_contract(path: str | None, cfg: dict) -> int:
    print("== validate_glb.py (sem arquivo) ==")
    print("Nenhum .glb informado. Como rodar:")
    print("  blender --background --python scripts/nathalia/validate_glb.py -- "
          + cfg["paths"]["master"])
    print("  python scripts/nathalia/validate_glb.py <arquivo.glb>   # estrutural")
    print("\nContrato (de nathalia_assets.config.json):")
    print(f"  objects   : {cfg['objects']}")
    print(f"  materials : {cfg['materials']}")
    print(f"  animations: {cfg['animations']}")
    print(f"  shapeKeys : {cfg['shapeKeys']}")
    print(f"  polycount : mvp<={cfg['polycount']['mvpMaxTris']} "
          f"ideal<={cfg['polycount']['idealMaxTris']} "
          f"hardMax={cfg['polycount']['hardMaxTris']}")
    print("\nNenhum arquivo foi modificado.")
    return 2


def main() -> int:
    args = parse_args(sys.argv)
    cfg = gm.load_config()

    if not args["path"]:
        return dry_contract(None, cfg)
    if not os.path.exists(args["path"]):
        print(f"ERROR: arquivo não encontrado: {args['path']}")
        return 1

    metrics = gm.collect_metrics(args["path"])
    print_metrics(metrics)

    result = gm.evaluate(metrics, cfg)
    print("\n== Avaliação ==")
    if result["hardFails"]:
        print(f"  {len(result['hardFails'])} violação(ões) DURA(S):")
        for f in result["hardFails"]:
            print(f"   x {f}")
    if result["warnings"]:
        print(f"  {len(result['warnings'])} aviso(s):")
        for w in result["warnings"]:
            print(f"   - {w}")
    if not result["hardFails"] and not result["warnings"]:
        print("  sem avisos")
    print(f"\n  decisão recomendada: {result['decisionHint']}")

    if metrics["mode"] == "structural":
        print("\n  NOTA: validação estrutural — rode no Blender para checar "
              "polycount, dimensões e rig.")

    if result["hardFails"]:
        return 1
    if args["strict"] and result["warnings"]:
        print("\n  --strict: reprovando porque há avisos.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
