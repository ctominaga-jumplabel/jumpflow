#!/usr/bin/env python3
"""Refine ``master_v2.blend`` → ``master_v3.blend`` toward the V3 visual reference.

Fase 8.3. This is an **incremental, contract-preserving** refinement: it OPENS the
Fase 7 ``master_v2.blend`` (never the heavy Tripo GLB) and nudges its *appearance*
toward ``docs/nathalia/Avatar_NathIA_v03_reference.png`` while keeping the model
light, rigged, animable and within the web budget.

What it changes (all **safe** w.r.t. shape keys / rig / actions):
  * MATERIALS — warmer skin, espresso hair, truer-black shirt, **orange** logo,
    **cream** pants and **black** sneakers (V3 silhouette palette).
  * EYES  — scales the ``Eyes`` mesh ~1.2× about each eye centre → bigger, more
    expressive eyes. ``Eyes`` has no shape keys, so this is non-destructive.
  * HAIR  — scales the ``Hair`` mesh ~+10% about its centroid → more volume.
  * LOGO  — slight enlarge about its centroid for a cleaner chest mark.

What it deliberately DOES NOT touch:
  * The ``Body`` geometry (it carries the 10 facial shape keys) — so every shape
    key, the 16-bone rig and the 9 actions are preserved untouched.
  * The object/material **count** (still 7 + 7) and the transform (≈1.6 m, feet on
    the floor, faces -Y).

It NEVER overwrites V1/V2. It writes ``master_v3.blend`` + ``master_v3_preview.glb``
(+ ``thumbnails/v3/*.png``) and validates the live scene.

Usage:
    python refine_master_v3.py                                   # print plan
    blender --background --python refine_master_v3.py            # dry-run (no write)
    blender --background --python refine_master_v3.py -- --apply # refine + export

Exit codes: 0 = ok / dry-run, 1 = a hard validation FAIL.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402

REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def _abs(rel: str) -> str:
    return rel if os.path.isabs(rel) else os.path.join(REPO_ROOT, rel)


# --------------------------------------------------------------------------- #
# V3 art direction (deltas vs V2). Hex are sRGB; converted to linear on apply.
# Roughness mirrors the premium sheet, warmed toward the V3 reference.
# --------------------------------------------------------------------------- #
V3_PALETTE = {
    # name:        (hex,       roughness)
    "MAT_Body":  ("#e8b189", 0.58),   # warmer, tanned skin
    "MAT_Hair":  ("#2a2320", 0.42),   # warm espresso (less purple than V2 #241f2b)
    "MAT_Eyes":  ("#ffffff", 0.16),   # bright sclera, a touch more spec
    "MAT_Shirt": ("#0e0e10", 0.62),   # truer black tee
    "MAT_Pants": ("#e6ddc8", 0.80),   # cream (V3 silhouette; was slate blue)
    "MAT_Shoes": ("#1b1b1f", 0.50),   # black low-top sneaker (was off-white)
    "MAT_Logo":  ("#ff7a18", 0.50),   # jumpflow orange (was white)
}

# Mesh refinements (factors about each part's own centre, world space).
EYE_SCALE = (1.22, 1.0, 1.26)   # wider + taller; keep depth → bigger, open eyes
HAIR_SCALE = (1.10, 1.12, 1.03)  # more volume (width + front/back depth)
LOGO_SCALE = (1.10, 1.0, 1.10)   # slightly larger chest mark


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_str: str):
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


# --------------------------------------------------------------------------- #
# Refinement steps (run on the opened master_v2 scene)
# --------------------------------------------------------------------------- #
def _recolor_materials() -> list[str]:
    import bpy

    changed = []
    for name, (hex_str, rough) in V3_PALETTE.items():
        mat = bpy.data.materials.get(name)
        if not mat:
            print(f"  ! material ausente: {name}")
            continue
        col = hex_to_linear(hex_str)
        if mat.use_nodes:
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            if bsdf:
                bsdf.inputs["Base Color"].default_value = col
                bsdf.inputs["Roughness"].default_value = rough
                bsdf.inputs["Metallic"].default_value = 0.0
                if name == "MAT_Eyes":
                    _set_optional(bsdf, "Specular IOR Level", 0.6)
                    _set_optional(bsdf, "Specular", 0.6)
        mat.diffuse_color = col
        changed.append(f"{name}={hex_str}")
    return changed


def _set_optional(bsdf, input_name, value) -> None:
    try:
        if input_name in bsdf.inputs:
            bsdf.inputs[input_name].default_value = value
    except Exception:
        pass


def _scale_mesh_about_centers(obj, factor, split_x=False) -> int:
    """Scale an object's vertices about its own centroid (or per-x-side centroid
    when ``split_x``), in **world space**, then write back to local coords.

    Safe only for meshes WITHOUT shape keys (``Eyes``/``Hair``/``Logo``). It moves
    geometry in place (no new verts), so the polycount is unchanged.
    """
    from mathutils import Vector

    me = obj.data
    if me.shape_keys is not None:
        # Guard: never run this on a shape-keyed mesh (would desync the keys).
        raise RuntimeError(f"{obj.name} tem shape keys — não escalar a malha aqui")

    mw = obj.matrix_world
    mwi = mw.inverted()
    world = [mw @ v.co for v in me.vertices]

    if split_x:
        left = [w for w in world if w.x >= 0]
        right = [w for w in world if w.x < 0]
        cl = _centroid(left) if left else Vector((0, 0, 0))
        cr = _centroid(right) if right else Vector((0, 0, 0))
    else:
        c = _centroid(world)

    fx, fy, fz = factor
    for i, v in enumerate(me.vertices):
        w = world[i]
        ctr = (cl if w.x >= 0 else cr) if split_x else c
        nw = Vector((
            ctr.x + (w.x - ctr.x) * fx,
            ctr.y + (w.y - ctr.y) * fy,
            ctr.z + (w.z - ctr.z) * fz,
        ))
        v.co = mwi @ nw
    me.update()
    return len(me.vertices)


def _centroid(points):
    from mathutils import Vector

    acc = Vector((0, 0, 0))
    for p in points:
        acc += p
    return acc / len(points)


def _refine_geometry() -> list[str]:
    import bpy

    notes = []
    eyes = bpy.data.objects.get("Eyes")
    hair = bpy.data.objects.get("Hair")
    logo = bpy.data.objects.get("Logo")

    if eyes:
        n = _scale_mesh_about_centers(eyes, EYE_SCALE, split_x=True)
        notes.append(f"Eyes ×{EYE_SCALE} ({n} verts)")
    if hair:
        n = _scale_mesh_about_centers(hair, HAIR_SCALE, split_x=False)
        notes.append(f"Hair ×{HAIR_SCALE} ({n} verts)")
    if logo:
        n = _scale_mesh_about_centers(logo, LOGO_SCALE, split_x=False)
        notes.append(f"Logo ×{LOGO_SCALE} ({n} verts)")
    return notes


# --------------------------------------------------------------------------- #
# Validation + export + thumbnails (live scene)
# --------------------------------------------------------------------------- #
def _validate_and_report(cfg) -> int:
    import report_master

    reports = []
    print("\n=== VALIDAÇÃO V3 (cena viva) ===")
    for section, module in report_master.VALIDATORS:
        rep = module.validate_scene(cfg, None)
        rep.finish()
        print()
        reports.append((section, rep))
    final = pc.worst(*[r.verdict() for _, r in reports])
    print(f"== RESULTADO CONSOLIDADO: {final} ==")

    out_dir = _abs(cfg["paths"]["reportsDir"])
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "MASTER_V3_VALIDATION_RAW.md")
    md = report_master.render_markdown("master_v3.blend (cena viva)", reports, final)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(md)
    print(f"relatório escrito: {out_path}")
    return 1 if final == pc.FAIL else 0


def _export_preview(cfg) -> str:
    import bpy

    models_dir = os.path.dirname(cfg["paths"]["masterGlb"])
    out = _abs(os.path.join(models_dir, "master_v3_preview.glb"))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    exp = cfg["export"]
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        export_image_format="AUTO" if exp["embedTextures"] else "NONE",
        export_draco_mesh_compression_enable=(exp["compression"] == "draco"),
        export_cameras=False,
        export_lights=False,
        export_yup=True,
        export_animations=True,
        export_morph=True,
    )
    print(f"master_v3_preview.glb exportado: {out}  ("
          f"{round(os.path.getsize(out)/1024, 1)} KB)")
    return out


def _render_thumbnails(cfg) -> None:
    import bpy
    from mathutils import Vector

    out_dir = _abs(os.path.join(cfg["paths"]["previewDir"], "v3"))
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene

    engine = "BLENDER_EEVEE"
    try:
        scene.render.engine = engine
    except Exception:  # pragma: no cover
        engine = "BLENDER_WORKBENCH"
        scene.render.engine = engine
    scene.render.film_transparent = True
    scene.render.resolution_x = 720
    scene.render.resolution_y = 900
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    if engine == "BLENDER_EEVEE":
        world = bpy.data.worlds.new("PreviewWorldV3")
        world.use_nodes = True
        bg = world.node_tree.nodes["Background"]
        bg.inputs[0].default_value = (0.9, 0.9, 0.92, 1.0)
        bg.inputs[1].default_value = 0.8
        scene.world = world

        def _lamp(name, loc, energy, size=3.0):
            data = bpy.data.lights.new(name, "AREA")
            data.energy = energy
            data.size = size
            obj = bpy.data.objects.new(name, data)
            obj.location = loc
            bpy.context.collection.objects.link(obj)
            direction = (Vector((0, 0, 1.0)) - Vector(loc)).normalized()
            obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

        _lamp("KeyV3", (-2.0, -2.5, 2.6), 400)
        _lamp("FillV3", (2.5, -1.5, 1.6), 150)
        _lamp("RimV3", (0.0, 2.8, 2.4), 200)
    else:
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.color_type = "MATERIAL"
        shading.show_shadows = True

    cam_data = bpy.data.cameras.new("PreviewCamV3")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.95
    cam_data.sensor_fit = "VERTICAL"
    cam = bpy.data.objects.new("PreviewCamV3", cam_data)
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

    target = Vector((0, 0, 0.82))
    views = {
        "front": Vector((0, -3.2, 0.9)),
        "side": Vector((3.2, 0, 0.9)),
        "back": Vector((0, 3.2, 0.9)),
        "three_quarter": Vector((-2.3, -2.3, 1.05)),
    }
    for name, loc in views.items():
        cam.location = loc
        direction = (target - loc).normalized()
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(out_dir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        print(f"thumbnail: {scene.render.filepath}")


# --------------------------------------------------------------------------- #
# Build orchestration
# --------------------------------------------------------------------------- #
def _v2_blend_path(cfg) -> str:
    return _abs(cfg["paths"].get("masterBlendV2")
                or cfg["paths"]["masterBlend"].replace(".blend", "_v2.blend"))


def _v3_blend_path(cfg) -> str:
    v2 = _v2_blend_path(cfg)
    return v2.replace("_v2.blend", "_v3.blend")


def _refine(cfg) -> int:
    import bpy

    src = _v2_blend_path(cfg)
    if not os.path.exists(src):
        print(f"ERRO: master_v2.blend não encontrado em {src}")
        print("Rode antes: blender --background --python construct_master_v2.py -- --apply")
        return 1

    print(f"abrindo base: {src}")
    bpy.ops.wm.open_mainfile(filepath=src)

    print("\n-- recolor materiais (paleta V3) --")
    for line in _recolor_materials():
        print(f"   {line}")

    print("\n-- refino de geometria (olhos/cabelo/logo) --")
    for line in _refine_geometry():
        print(f"   {line}")

    dst = _v3_blend_path(cfg)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=dst)
    print(f"\nmaster_v3.blend salvo: {dst}")
    return 0


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def _print_plan(cfg) -> None:
    print("== refine_master_v3.py ==")
    print("Refina master_v2.blend → master_v3.blend rumo à referência V3 (Fase 8.3).")
    print(f"  base      : {os.path.relpath(_v2_blend_path(cfg), REPO_ROOT)}")
    print(f"  saída     : {os.path.relpath(_v3_blend_path(cfg), REPO_ROOT)}")
    print(f"  objetos   : {cfg['objects']} (7, contrato preservado)")
    print(f"  materiais : {cfg['materials']} (7, recolor V3)")
    print("  olhos     : escala da malha Eyes (sem shape keys) → maiores")
    print("  cabelo    : escala da malha Hair → mais volume")
    print("  paleta    : pele quente, cabelo espresso, camiseta preta, logo laranja,")
    print("              calça creme, tênis preto (silhueta V3)")
    print("  preservado: Body + shape keys + rig (16 bones) + 9 actions intactos")
    print("\nUse --apply dentro do Blender para refinar e exportar.")


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv, flags=("--apply",))

    if not pc.in_blender():
        _print_plan(cfg)
        print("\nSem Blender (bpy): apenas o plano acima. Nada foi escrito.")
        return 0

    if not args["apply"]:
        _print_plan(cfg)
        print("\nDry-run dentro do Blender (sem --apply). Nada foi construído.")
        return 0

    print("== refine_master_v3.py (APPLY) ==")
    code = _refine(cfg)
    if code != 0:
        return code
    code = _validate_and_report(cfg)
    try:
        _export_preview(cfg)
    except Exception as exc:  # pragma: no cover
        print(f"export preview falhou: {exc}")
    try:
        _render_thumbnails(cfg)
    except Exception as exc:  # pragma: no cover
        print(f"render thumbnails falhou: {exc}")
    return code


if __name__ == "__main__":
    sys.exit(main())
