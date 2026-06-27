#!/usr/bin/env python3
"""Construct the first canonical ``master.blend`` for Nathal.IA (Fase 5).

This is the real geometry/rig/shape-keys/actions/materials builder that the
Fase 4 orchestrator (``build_master.py``) left as the manual stages. It builds a
**low-poly, parametric, modular** character from scratch — using
``nathalia_tripo_v02.glb`` only as a visual/proportion reference (NEVER promoting
it). Everything is driven by the canon:

  * proportions / colors -> CHARACTER_SHEET_PREMIUM.md
  * objects / structure  -> MASTER_GLB_BLUEPRINT.md
  * rig                  -> RIG_BLUEPRINT.md
  * shape keys           -> SHAPE_KEYS_BLUEPRINT.md
  * actions (MVP 3)      -> ACTIONS_BLUEPRINT.md
  * contract / names     -> master_character_config.json

It produces, under ``--apply`` inside Blender:

  1. ``master.blend``                       (paths.masterBlend) — source of truth
  2. ``MASTER_VALIDATION_REPORT.md``         (reportsDir)        — live-scene report
  3. ``master_preview.glb``                  (models/)           — derived preview
  4. ``front/side/back/three_quarter.png``   (thumbnails/)       — previews

The ``master.blend`` is NEVER overwritten by the preview export (D-001).

Usage:
    python construct_master.py                                  # print the plan
    blender --background --python construct_master.py            # dry-run in Blender
    blender --background --python construct_master.py -- --apply # build everything

Exit codes: 0 = ok / dry-run, 1 = a hard validation FAIL.
"""
from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402

# Repo root, so config relative paths resolve regardless of CWD.
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def _abs(rel: str) -> str:
    return rel if os.path.isabs(rel) else os.path.join(REPO_ROOT, rel)


# --------------------------------------------------------------------------- #
# Canonical palette (sRGB hex from CHARACTER_SHEET_PREMIUM.md §Materiais)
# --------------------------------------------------------------------------- #
PALETTE = {
    "MAT_Body":  ("#f3c6a3", 0.60),
    "MAT_Hair":  ("#241f2b", 0.45),
    "MAT_Eyes":  ("#ffffff", 0.20),
    "MAT_Shirt": ("#111814", 0.70),
    "MAT_Pants": ("#2b3340", 0.75),
    "MAT_Shoes": ("#ece9e0", 0.60),
    "MAT_Logo":  ("#ffffff", 0.70),
}
IRIS_HEX = "#3a2e2a"
ACCENT_ORANGE = "#ff7a18"

# Proportion ruler (metres). 4.5 head-units = 1.60 m; feet at z=0; faces -Y.
# Mirrors CHARACTER_SHEET_PREMIUM.md §Proporções / régua vertical.
Z_FLOOR = 0.00
Z_KNEE = 0.18
Z_HIP = 0.80
Z_SHOULDER = 1.16
Z_NECK = 1.20
Z_CHIN = 1.27
Z_HEAD_C = 1.41   # head centre
Z_TOP_SKULL = 1.55
HEAD_R = 0.135
EYE_Z = 1.43
MOUTH_Z = 1.34


def srgb_to_linear(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(hex_str: str):
    h = hex_str.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


# --------------------------------------------------------------------------- #
# Build helpers (only import bpy when actually building)
# --------------------------------------------------------------------------- #
def _build(cfg: dict) -> None:
    import bpy
    from mathutils import Vector

    # ---- clean slate + scene units -------------------------------------- #
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 24

    # ---- materials ------------------------------------------------------ #
    mats = {}
    for name, (hex_str, rough) in PALETTE.items():
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        col = hex_to_linear(hex_str)
        if bsdf:
            bsdf.inputs["Base Color"].default_value = col
            bsdf.inputs["Roughness"].default_value = rough
            bsdf.inputs["Metallic"].default_value = 0.0
        mat.diffuse_color = col  # viewport / Workbench MATERIAL color
        mats[name] = mat

    # ---- primitive helpers ---------------------------------------------- #
    def _finish(scale=(1, 1, 1), rot=None):
        obj = bpy.context.active_object
        obj.scale = scale
        if rot is not None:
            obj.rotation_euler = rot
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        return obj

    def sphere(loc, r, scale=(1, 1, 1), seg=20, ring=12):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=ring,
                                             radius=r, location=loc)
        return _finish(scale)

    def capsule(p1, p2, r1, r2, verts=14):
        p1, p2 = Vector(p1), Vector(p2)
        d = p2 - p1
        length = d.length
        mid = (p1 + p2) / 2
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2,
                                        depth=length, location=mid)
        quat = Vector((0, 0, 1)).rotation_difference(d.normalized())
        return _finish(rot=quat.to_euler())

    def box(loc, half, scale=(1, 1, 1)):
        bpy.ops.mesh.primitive_cube_add(location=loc)
        obj = bpy.context.active_object
        obj.scale = (half[0] * scale[0], half[1] * scale[1], half[2] * scale[2])
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        return obj

    def join(parts, name, material):
        bpy.ops.object.select_all(action="DESELECT")
        for p in parts:
            p.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        obj = bpy.context.active_object
        obj.name = name
        obj.data.name = name + "_mesh"
        obj.data.materials.clear()
        obj.data.materials.append(material)
        # cleanup: weld coincident verts + consistent normals (mesh hygiene,
        # fewer "mesh not valid" export warnings).
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=0.0002)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.shade_smooth()
        return obj

    SX = 1  # +X is the character's LEFT (.L), per RIG_BLUEPRINT (faces -Y)

    # ---- Body (skin): head, neck, arms, hands --------------------------- #
    body_parts = [
        sphere((0, 0, Z_HEAD_C), HEAD_R, scale=(1.0, 0.95, 1.12)),     # head
        capsule((0, 0, Z_NECK - 0.02), (0, 0, Z_CHIN), 0.052, 0.055),  # neck
    ]
    for s in (+1, -1):  # arms (.L = +X, .R = -X)
        sh = (s * 0.18, 0, Z_SHOULDER - 0.02)
        el = (s * 0.31, 0, 0.86)
        wr = (s * 0.40, 0, 0.63)
        body_parts += [
            sphere(sh, 0.06),                              # shoulder
            capsule(sh, el, 0.053, 0.045),                 # upper arm
            sphere(el, 0.045),                             # elbow
            capsule(el, wr, 0.043, 0.036),                 # lower arm
            sphere((s * 0.42, 0, 0.57), 0.055, scale=(1.0, 0.55, 1.25)),  # hand
        ]
    body = join(body_parts, "Body", mats["MAT_Body"])

    # ---- Eyes (single canonical material in the structural v1; iris colour
    # IRIS_HEX is reserved for a future iris sub-mesh/decal) -------------- #
    eye_parts = []
    for s in (+1, -1):
        eye_parts.append(sphere((s * 0.052, -0.104, EYE_Z), 0.024,
                                scale=(1.0, 0.8, 1.0), seg=14, ring=8))
    eyes = join(eye_parts, "Eyes", mats["MAT_Eyes"])

    # ---- Hair: back curtain + crown + fringe + side strands ------------- #
    hair_parts = [
        sphere((0, 0.06, 1.24), 0.15, scale=(1.10, 0.70, 1.65)),   # back curtain
        sphere((0, 0.01, 1.47), 0.15, scale=(1.06, 1.06, 0.66)),   # crown cap
        sphere((0, -0.085, 1.50), 0.12, scale=(1.15, 0.55, 0.42)), # fringe
    ]
    for s in (+1, -1):
        hair_parts.append(
            capsule((s * 0.125, -0.02, 1.42), (s * 0.115, 0.0, 1.10),
                    0.045, 0.035))                                  # side strand
    hair = join(hair_parts, "Hair", mats["MAT_Hair"])

    # ---- Shirt: torso + short sleeves ----------------------------------- #
    shirt_parts = [
        # torso (cylinder, wider than deep)
        _shirt_torso(bpy),
    ]
    for s in (+1, -1):
        sh = (s * 0.18, 0, Z_SHOULDER - 0.01)
        mid = (s * 0.27, 0, 0.96)
        shirt_parts.append(capsule(sh, mid, 0.085, 0.072))         # sleeve
    shirt_parts.append(sphere((0, 0, Z_SHOULDER), 0.085, scale=(1.9, 1.0, 0.45)))  # collar/shoulders
    shirt = join(shirt_parts, "Shirt", mats["MAT_Shirt"])

    # ---- Pants: hip + legs ---------------------------------------------- #
    pants_parts = [box((0, 0, Z_HIP - 0.02), (0.18, 0.13, 0.10))]
    for s in (+1, -1):
        hip = (s * 0.10, 0, Z_HIP - 0.02)
        knee = (s * 0.115, 0, 0.42)
        ankle = (s * 0.125, 0, 0.10)
        pants_parts += [
            capsule(hip, knee, 0.10, 0.066),     # thigh
            sphere(knee, 0.062),                 # knee
            capsule(knee, ankle, 0.062, 0.05),   # calf
        ]
    pants = join(pants_parts, "Pants", mats["MAT_Pants"])

    # ---- Shoes ---------------------------------------------------------- #
    shoe_parts = []
    for s in (+1, -1):
        shoe_parts.append(box((s * 0.125, -0.045, 0.035), (0.052, 0.11, 0.035)))
        shoe_parts.append(sphere((s * 0.125, -0.15, 0.045), 0.05,
                                 scale=(1.0, 1.0, 0.9), seg=14, ring=8))  # toe
    shoes = join(shoe_parts, "Shoes", mats["MAT_Shoes"])

    # ---- Logo (wordmark "jump" on the chest) ---------------------------- #
    logo = _make_logo(bpy, mats["MAT_Logo"])

    # ---- Shape keys on Body (7 facial blend shapes) --------------------- #
    _add_shape_keys(body)

    # ---- Armature (16 bones) + skinning --------------------------------- #
    arm = _build_armature(bpy)
    root = _wrap_root(bpy, arm)
    meshes = [body, hair, eyes, shirt, pants, shoes, logo]
    _skin(bpy, arm, meshes)

    # ---- Actions (MVP: Idle, Wave, Thinking) ---------------------------- #
    _build_actions(bpy, arm)

    # ---- save master.blend (source of truth) ---------------------------- #
    blend_path = _abs(cfg["paths"]["masterBlend"])
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"\nmaster.blend salvo: {blend_path}")


def _shirt_torso(bpy):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.165, depth=0.40,
                                        location=(0, 0, 0.97))
    obj = bpy.context.active_object
    obj.scale = (1.18, 0.82, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def _make_logo(bpy, material):
    bpy.ops.object.text_add(location=(0, -0.146, 1.02))
    obj = bpy.context.active_object
    obj.name = "Logo"
    obj.data.body = "jump"
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = 0.072
    obj.data.extrude = 0.004
    obj.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.convert(target="MESH")
    obj = bpy.context.active_object
    obj.name = "Logo"
    obj.data.name = "Logo_mesh"
    obj.data.materials.clear()
    obj.data.materials.append(material)
    return obj


def _add_shape_keys(body):
    """7 regional facial blend shapes (functional placeholders, non-destructive)."""
    body.shape_key_add(name="Basis", from_mix=False)

    def make(name, fn):
        kb = body.shape_key_add(name=name, from_mix=False)
        basis = body.data.shape_keys.key_blocks["Basis"].data
        for i, v in enumerate(basis):
            co = v.co.copy()
            dx, dy, dz = fn(co.x, co.y, co.z)
            kb.data[i].co = (co.x + dx, co.y + dy, co.z + dz)

    def smile(x, y, z):
        if y < -0.04 and 1.30 <= z <= 1.37 and 0.025 <= abs(x) <= 0.10:
            return (0.0, 0.0, 0.014)           # mouth corners up
        if y < -0.02 and 1.36 <= z <= 1.41 and 0.04 <= abs(x) <= 0.11:
            return (0.0, 0.0, 0.005)           # cheeks raise
        return (0, 0, 0)

    def open_mouth(x, y, z):
        if y < -0.04 and 1.28 <= z <= 1.345 and abs(x) <= 0.06:
            return (0.0, -0.008, -0.022)       # jaw drop
        return (0, 0, 0)

    def blink(side):
        def fn(x, y, z):
            if (x * side) > 0.015 and y < -0.03 and 1.40 <= z <= 1.47 \
                    and 0.02 <= abs(x) <= 0.09:
                return (0.0, 0.0, -0.016)       # eyelid down
            return (0, 0, 0)
        return fn

    def surprised(x, y, z):
        if y < -0.02 and 1.46 <= z <= 1.53:
            return (0.0, 0.0, 0.011)           # brows up
        if y < -0.04 and 1.30 <= z <= 1.345 and abs(x) <= 0.05:
            return (0.0, -0.004, -0.009)       # small "oh"
        return (0, 0, 0)

    def thinking(x, y, z):
        if x > 0.0 and y < -0.02 and 1.46 <= z <= 1.53 and abs(x) <= 0.09:
            return (0.0, 0.0, 0.013)           # one brow up
        return (0, 0, 0)

    def sad(x, y, z):
        if y < -0.04 and 1.30 <= z <= 1.37 and 0.03 <= abs(x) <= 0.10:
            return (0.0, 0.0, -0.013)          # mouth corners down
        if y < -0.02 and 1.47 <= z <= 1.52 and abs(x) <= 0.045:
            return (0.0, 0.0, 0.008)           # inner brow up
        return (0, 0, 0)

    make("Smile", smile)
    make("Blink_L", blink(+1))
    make("Blink_R", blink(-1))
    make("Thinking", thinking)
    make("Surprised", surprised)
    make("Sad", sad)
    make("OpenMouth", open_mouth)


def _build_armature(bpy):
    from mathutils import Vector

    arm_data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

    # (name, head, tail, parent)
    spec = [
        ("Pelvis", (0, 0, 0.80), (0, 0, 0.95), None),
        ("Spine", (0, 0, 0.95), (0, 0, Z_NECK), "Pelvis"),
        ("Neck", (0, 0, Z_NECK), (0, 0, Z_CHIN + 0.02), "Spine"),
        ("Head", (0, 0, Z_CHIN + 0.02), (0, 0, Z_TOP_SKULL), "Neck"),
    ]
    for s, lr in ((+1, "L"), (-1, "R")):
        spec += [
            (f"UpperArm.{lr}", (s * 0.18, 0, Z_SHOULDER - 0.02), (s * 0.31, 0, 0.86), "Spine"),
            (f"LowerArm.{lr}", (s * 0.31, 0, 0.86), (s * 0.40, 0, 0.63), f"UpperArm.{lr}"),
            (f"Hand.{lr}", (s * 0.40, 0, 0.63), (s * 0.44, 0, 0.53), f"LowerArm.{lr}"),
            (f"UpperLeg.{lr}", (s * 0.10, 0, 0.80), (s * 0.115, 0, 0.42), "Pelvis"),
            (f"LowerLeg.{lr}", (s * 0.115, 0, 0.42), (s * 0.125, 0, 0.12), f"UpperLeg.{lr}"),
            (f"Foot.{lr}", (s * 0.125, 0, 0.12), (s * 0.125, -0.14, 0.04), f"LowerLeg.{lr}"),
        ]

    created = {}
    for name, head, tail, _ in spec:
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        created[name] = b
    for name, _, _, parent in spec:
        if parent:
            created[name].parent = created[parent]
            created[name].use_connect = False

    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def _wrap_root(bpy, arm):
    root = bpy.data.objects.new("Nathalia", None)  # empty root
    bpy.context.collection.objects.link(root)
    arm.parent = root
    return root


def _skin(bpy, arm, meshes):
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for m in meshes:
        m.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        print("skinning: automatic weights (bone heat)")
    except RuntimeError as exc:
        print(f"skinning: heat falhou ({exc}); usando envelope")
        bpy.ops.object.select_all(action="DESELECT")
        for m in meshes:
            m.select_set(True)
        arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")


def _build_actions(bpy, arm):
    """MVP actions: Idle (loop ~4s), Wave (~1.5s), Thinking (~2.2s)."""
    import math as _m

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    if arm.animation_data is None:
        arm.animation_data_create()

    def key(action, frame, poses):
        bpy.context.scene.frame_set(frame)
        for bone, euler in poses.items():
            pb = arm.pose.bones.get(bone)
            if not pb:
                continue
            pb.rotation_euler = euler
            pb.keyframe_insert("rotation_euler", frame=frame)

    def neutral():
        return {b.name: (0, 0, 0) for b in arm.pose.bones}

    R = _m.radians

    # ---- Idle: gentle breathing + sway, 1..97 (=4.0s @24fps) ------------ #
    idle = bpy.data.actions.new("Idle")
    arm.animation_data.action = idle
    key(idle, 1, neutral())
    key(idle, 49, {"Spine": (R(2.5), 0, 0), "Head": (R(-2), 0, R(1.5)),
                   "UpperArm.L": (0, 0, R(-3)), "UpperArm.R": (0, 0, R(3))})
    key(idle, 97, neutral())

    # ---- Wave: right arm raises + waves, 1..37 (=1.5s) ------------------ #
    wave = bpy.data.actions.new("Wave")
    arm.animation_data.action = wave
    key(wave, 1, neutral())
    key(wave, 9, {"UpperArm.R": (0, R(-35), R(70)), "LowerArm.R": (0, 0, R(35))})
    key(wave, 18, {"UpperArm.R": (0, R(-35), R(70)), "LowerArm.R": (0, 0, R(60)),
                   "Hand.R": (0, 0, R(20))})
    key(wave, 27, {"UpperArm.R": (0, R(-35), R(70)), "LowerArm.R": (0, 0, R(35)),
                   "Hand.R": (0, 0, R(-20))})
    key(wave, 37, neutral())

    # ---- Thinking: hand to chin + head tilt, 1..54 (=2.2s) -------------- #
    think = bpy.data.actions.new("Thinking")
    arm.animation_data.action = think
    key(think, 1, neutral())
    key(think, 15, {"UpperArm.R": (0, R(-20), R(38)), "LowerArm.R": (0, 0, R(95)),
                    "Head": (R(6), 0, R(-6))})
    key(think, 40, {"UpperArm.R": (0, R(-20), R(38)), "LowerArm.R": (0, 0, R(95)),
                    "Head": (R(6), 0, R(-6))})
    key(think, 54, neutral())

    # persist actions in the .blend and stash on NLA so they export
    for act in (idle, wave, think):
        act.use_fake_user = True
        track = arm.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, int(act.frame_range[0]), act)

    # back to neutral bind pose for save/export/render
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_euler = (0, 0, 0)
    bpy.context.scene.frame_set(1)
    bpy.ops.object.mode_set(mode="OBJECT")


# --------------------------------------------------------------------------- #
# Validation + export + thumbnails (run on the live built scene)
# --------------------------------------------------------------------------- #
def _validate_and_report(cfg) -> int:
    import report_master
    reports = []
    print("\n=== VALIDAÇÃO (cena viva) ===")
    for section, module in report_master.VALIDATORS:
        rep = module.validate_scene(cfg, None)
        rep.finish()
        print()
        reports.append((section, rep))
    final = pc.worst(*[r.verdict() for _, r in reports])
    print(f"== RESULTADO CONSOLIDADO: {final} ==")

    out_dir = _abs(cfg["paths"]["reportsDir"])
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "MASTER_VALIDATION_REPORT.md")
    md = report_master.render_markdown("master.blend (cena viva)", reports, final)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(md)
    print(f"relatório escrito: {out_path}")
    return 1 if final == pc.FAIL else 0


def _export_preview(cfg) -> None:
    import bpy
    out = _abs(os.path.join(os.path.dirname(cfg["paths"]["masterGlb"]),
                            "master_preview.glb"))
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
    print(f"master_preview.glb exportado: {out}  ("
          f"{round(os.path.getsize(out)/1024, 1)} KB)")


def _render_thumbnails(cfg) -> None:
    import bpy
    from mathutils import Vector

    out_dir = _abs(cfg["paths"]["previewDir"])
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene

    # EEVEE gives colour-accurate, softly-lit previews (true palette). It renders
    # headless on this setup; Workbench is the fallback if a GPU context fails.
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
        world = bpy.data.worlds.new("PreviewWorld")
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

        _lamp("Key", (-2.0, -2.5, 2.6), 400)
        _lamp("Fill", (2.5, -1.5, 1.6), 150)
        _lamp("Rim", (0.0, 2.8, 2.4), 200)
    else:
        shading = scene.display.shading
        shading.light = "STUDIO"
        shading.color_type = "MATERIAL"
        shading.show_shadows = True

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.95
    cam_data.sensor_fit = "VERTICAL"
    cam = bpy.data.objects.new("PreviewCam", cam_data)
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
# Entry point
# --------------------------------------------------------------------------- #
def _print_plan(cfg) -> None:
    print("== construct_master.py ==")
    print("Constrói o primeiro master.blend canônico da Nathal.IA (Fase 5).")
    print(f"  objetos   : {cfg['objects']}")
    print(f"  materiais : {cfg['materials']}")
    print(f"  bones     : {len(cfg['rigBones'])}")
    print(f"  shapeKeys : {cfg['shapeKeys']}")
    print("  actions   : ['Idle', 'Wave', 'Thinking'] (MVP; demais na próxima fase)")
    print(f"  master    : {cfg['paths']['masterBlend']}")
    print("\nUse --apply dentro do Blender para construir de verdade.")


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

    print("== construct_master.py (APPLY) ==")
    _build(cfg)
    code = _validate_and_report(cfg)
    try:
        _export_preview(cfg)
    except Exception as exc:  # pragma: no cover - export is best-effort
        print(f"export preview falhou: {exc}")
    try:
        _render_thumbnails(cfg)
    except Exception as exc:  # pragma: no cover - render is best-effort
        print(f"render thumbnails falhou: {exc}")
    return code


if __name__ == "__main__":
    sys.exit(main())
