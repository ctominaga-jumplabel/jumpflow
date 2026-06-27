#!/usr/bin/env python3
"""Export the Nathal.IA master character scene to ``master.glb``.

PHASE 4 STATUS: prepared structure. This script documents and wires the export
settings (glTF 2.0 binary, embedded textures, Draco, no cameras/lights) but
**does not write a real master.glb** unless you pass ``--apply`` AND run inside
Blender with a built scene. This guards the source of truth (D-001) against
accidental empty exports.

Export contract (``master_character_config.json`` -> ``export`` / ``transform``):
  * format        : glTF 2.0 binary (.glb), textures embedded,
  * compression   : Draco,
  * no cameras/lights,
  * scale 1 u = 1 m, +Y up, facing -Z, feet on the floor.

After export, run ``validate_glb.py`` on the result and complete the
MASTER_GLB_ACCEPTANCE_CHECKLIST (ADR-010) before promoting to ``master.glb``.

Usage:
    # dry run (default): reports settings, writes nothing
    blender --background --python export_master_glb.py
    # actually export the live/built scene:
    blender --background --python export_master_glb.py -- --apply
    blender --background --python export_master_glb.py -- out.glb --apply

Exit codes: 0 = ok/dry-run, 1 = --apply without Blender or empty scene.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402


def describe_settings(cfg: dict, out_path: str) -> None:
    exp = cfg["export"]
    tr = cfg["transform"]
    print("export settings (glTF 2.0):")
    print(f"  output      : {out_path}")
    print(f"  format      : {exp['format']} (binary)")
    print(f"  textures    : {'embedded' if exp['embedTextures'] else 'external'}")
    print(f"  compression : {exp['compression']}")
    print(f"  cameras/luzes: {'none' if exp['noCamerasOrLights'] else 'incluídas'}")
    print(f"  scale/up/face: {tr['unitMetersPerUnit']} u/m, {tr['upAxis']} up, {tr['facingAxis']}")


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv, flags=("--apply",))
    out_path = args["path"] or cfg["paths"]["masterGlb"]
    apply = args["apply"]

    print("== export_master_glb.py ==")
    print(f"mode: {'APPLY (escreve .glb)' if apply else 'dry-run (seguro)'}")
    describe_settings(cfg, out_path)

    if not apply:
        print("\nNenhum arquivo escrito (dry-run). Use --apply dentro do Blender.")
        print("Fase 4 entrega a esteira; o master.glb real é gerado na Fase 5.")
        return 0

    if not pc.in_blender():
        print("\nERROR: --apply requer Blender (bpy). Abortando sem escrever.")
        return 1

    import bpy

    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    if not meshes:
        print("\nERROR: cena vazia — nada para exportar. Construa o master.blend antes.")
        return 1

    exp = cfg["export"]
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        export_image_format="AUTO" if exp["embedTextures"] else "NONE",
        export_draco_mesh_compression_enable=(exp["compression"] == "draco"),
        export_cameras=not exp["noCamerasOrLights"],
        export_lights=not exp["noCamerasOrLights"],
        export_yup=(cfg["transform"]["upAxis"] == "Y"),
    )
    print(f"\nExportado: {out_path}")
    print("Próximo: rode validate_glb.py e cumpra o MASTER_GLB_ACCEPTANCE_CHECKLIST.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
