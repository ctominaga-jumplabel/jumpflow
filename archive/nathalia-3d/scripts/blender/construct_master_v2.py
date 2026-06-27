#!/usr/bin/env python3
"""Construct ``master_v2.blend`` — the Fase 7 artistic refinement of Nathal.IA.

This is the V2 builder. It keeps the exact contract of the Fase 5 builder
(``construct_master.py``) — **7 objects, 7 materials, 16-bone rig, feet on the
floor, ~1.6 m, faces -Y** — so every validator and the Fase 6 runtime stay
compatible, while pushing the character from a technical MVP toward the concept:

  * FACE     — real eyebrows, irises and a mouth line (folded into the Body mesh
               as a second ``MAT_Hair`` slot, so the facial shape keys deform
               them) → far more empathy and small-size readability.
  * HAIR     — fuller, longer back curtain (to mid-torso), softer asymmetric
               fringe, extra side strands → the #1 silhouette marker.
  * CLOTHING — crew-neck collar ring, shaped sleeve cuffs, sneaker sole/toe cap,
               cleaner chest wordmark.
  * MATERIAL — palette pinned to CHARACTER_SHEET_PREMIUM with refined roughness
               and a touch of eye specular (stylized premium, still web-light).
  * EXPRESSION — +3 shape keys (Curious, Greeting, Celebrate) → 10 total.
  * ANIMATION  — +6 actions (Pointing, Explaining, Celebrate, Typing, Alert,
               Greeting) → 9 body clips, with a livelier Idle.

It NEVER overwrites the V1 ``master.blend``/``master_preview.glb``; it writes its
own ``master_v2.blend`` + ``master_v2_preview.glb`` + ``thumbnails/v2/*.png``.

Usage:
    python construct_master_v2.py                                  # print plan
    blender --background --python construct_master_v2.py            # dry-run
    blender --background --python construct_master_v2.py -- --apply # build all

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

REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def _abs(rel: str) -> str:
    return rel if os.path.isabs(rel) else os.path.join(REPO_ROOT, rel)


def _v2_path(v1_rel: str, suffix: str = "_v2") -> str:
    """Derive a v2 sibling path from a v1 path (``master.blend`` -> ``master_v2.blend``)."""
    base, ext = os.path.splitext(v1_rel)
    return f"{base}{suffix}{ext}"


# --------------------------------------------------------------------------- #
# Canonical palette (sRGB hex from CHARACTER_SHEET_PREMIUM.md §Materiais).
# Roughness values mirror the sheet exactly; V2 only refines eye specular.
# --------------------------------------------------------------------------- #
PALETTE = {
    "MAT_Body":  ("#f3c6a3", 0.60),
    "MAT_Hair":  ("#241f2b", 0.45),
    "MAT_Eyes":  ("#ffffff", 0.18),
    "MAT_Shirt": ("#111814", 0.70),
    "MAT_Pants": ("#2b3340", 0.75),
    "MAT_Shoes": ("#ece9e0", 0.60),
    "MAT_Logo":  ("#ffffff", 0.70),
}
IRIS_HEX = "#3a2e2a"
ACCENT_ORANGE = "#ff7a18"

# Proportion ruler (metres). 4.5 head-units = 1.60 m; feet at z=0; faces -Y.
Z_FLOOR = 0.00
Z_KNEE = 0.18
Z_HIP = 0.80
Z_SHOULDER = 1.16
Z_NECK = 1.20
Z_CHIN = 1.27
Z_HEAD_C = 1.41
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
# Build
# --------------------------------------------------------------------------- #
def _build(cfg: dict) -> None:
    import bpy
    from mathutils import Vector

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
            # V2: a touch of spec on the eyes for a "living" highlight; flat
            # elsewhere (optional input, guarded across Blender versions).
            if name == "MAT_Eyes":
                _set_optional(bsdf, "Specular IOR Level", 0.6)
                _set_optional(bsdf, "Specular", 0.6)
        mat.diffuse_color = col
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

    def box(loc, half, scale=(1, 1, 1), rot=None):
        bpy.ops.mesh.primitive_cube_add(location=loc)
        obj = bpy.context.active_object
        obj.scale = (half[0] * scale[0], half[1] * scale[1], half[2] * scale[2])
        if rot is not None:
            obj.rotation_euler = rot
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        return obj

    def torus(loc, major, minor, scale=(1, 1, 1), rot=None, maj_seg=20, min_seg=8):
        bpy.ops.mesh.primitive_torus_add(location=loc, major_radius=major,
                                         minor_radius=minor,
                                         major_segments=maj_seg,
                                         minor_segments=min_seg)
        return _finish(scale, rot)

    def setmat(obj, material):
        obj.data.materials.clear()
        obj.data.materials.append(material)
        return obj

    def assemble(name, groups):
        """Join several material groups into one object, preserving per-face
        materials. ``groups`` = list of (list_of_objs, material)."""
        all_objs = []
        for parts, material in groups:
            for p in parts:
                setmat(p, material)
                all_objs.append(p)
        bpy.ops.object.select_all(action="DESELECT")
        for p in all_objs:
            p.select_set(True)
        bpy.context.view_layer.objects.active = all_objs[0]
        if len(all_objs) > 1:
            bpy.ops.object.join()
        obj = bpy.context.active_object
        obj.name = name
        obj.data.name = name + "_mesh"
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=0.0002)
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        bpy.ops.object.shade_smooth()
        return obj

    # ---- Body (skin) + facial details (brows/iris/mouth) ---------------- #
    skin_parts = [
        sphere((0, 0, Z_HEAD_C), HEAD_R, scale=(1.0, 0.95, 1.12)),     # head
        capsule((0, 0, Z_NECK - 0.02), (0, 0, Z_CHIN), 0.052, 0.055),  # neck
    ]
    # small nose plane (subtle, skin-coloured) — gives the profile a hint of nose
    skin_parts.append(sphere((0, -0.128, 1.405), 0.018, scale=(0.7, 0.9, 0.7),
                             seg=10, ring=6))
    for s in (+1, -1):
        sh = (s * 0.18, 0, Z_SHOULDER - 0.02)
        el = (s * 0.31, 0, 0.86)
        wr = (s * 0.40, 0, 0.63)
        skin_parts += [
            sphere(sh, 0.06),
            capsule(sh, el, 0.053, 0.045),
            sphere(el, 0.045),
            capsule(el, wr, 0.043, 0.036),
            sphere((s * 0.42, 0, 0.57), 0.055, scale=(1.0, 0.55, 1.25)),
        ]

    # Facial details — dark (MAT_Hair). Built into Body so the face shape keys
    # (Surprised/Thinking/Sad/Smile/OpenMouth/...) deform them too.
    detail_parts = []
    for s in (+1, -1):
        # eyebrow: thin arched bar above each eye (slight outward tilt)
        detail_parts.append(
            box((s * 0.058, -0.121, 1.474), (0.034, 0.006, 0.008),
                rot=(0, 0, math.radians(-6 * s))))
        # iris/pupil: small flattened dark disc in front of the white eye
        detail_parts.append(
            sphere((s * 0.052, -0.122, EYE_Z), 0.012,
                   scale=(1.0, 0.45, 1.0), seg=12, ring=6))
    # mouth line: a soft dark bar with a gentle smile lift at the corners
    detail_parts.append(
        box((0, -0.120, MOUTH_Z - 0.004), (0.040, 0.006, 0.006)))
    for s in (+1, -1):  # raised corners → resting micro-smile
        detail_parts.append(
            sphere((s * 0.039, -0.118, MOUTH_Z + 0.006), 0.009,
                   scale=(1.0, 0.4, 0.7), seg=8, ring=6))

    body = assemble("Body", [
        (skin_parts, mats["MAT_Body"]),
        (detail_parts, mats["MAT_Hair"]),
    ])

    # ---- Eyes (white sclera) -------------------------------------------- #
    eye_parts = []
    for s in (+1, -1):
        eye_parts.append(sphere((s * 0.052, -0.104, EYE_Z), 0.024,
                                scale=(1.0, 0.8, 1.0), seg=14, ring=8))
    eyes = assemble("Eyes", [(eye_parts, mats["MAT_Eyes"])])

    # ---- Hair: fuller back curtain (to mid-torso) + crown + soft fringe -- #
    hair_parts = [
        sphere((0, 0.07, 1.22), 0.165, scale=(1.18, 0.74, 1.85)),   # back mass
        sphere((0, 0.05, 0.98), 0.115, scale=(1.30, 0.55, 1.45)),   # back length
        sphere((0, 0.005, 1.475), 0.155, scale=(1.10, 1.10, 0.70)), # crown cap
        sphere((-0.02, -0.085, 1.50), 0.125, scale=(1.22, 0.58, 0.46)),  # fringe (asym)
    ]
    for s in (+1, -1):
        # two side strands per side, framing the face down past the shoulder
        hair_parts.append(
            capsule((s * 0.135, -0.02, 1.44), (s * 0.125, 0.02, 1.06),
                    0.05, 0.038))
        hair_parts.append(
            capsule((s * 0.115, 0.04, 1.30), (s * 0.10, 0.06, 0.92),
                    0.045, 0.03))
    hair = assemble("Hair", [(hair_parts, mats["MAT_Hair"])])

    # ---- Shirt: torso + crew collar ring + shaped short sleeves --------- #
    shirt_parts = [_shirt_torso(bpy)]
    # crew neckline: a shallow ring sitting flat on the upper chest (read as a
    # collar opening, not a vertical band). Kept low + wide to avoid a "tie" look.
    shirt_parts.append(
        torus((0, -0.01, Z_SHOULDER - 0.005), 0.09, 0.012, scale=(1.25, 0.7, 0.5)))
    for s in (+1, -1):
        sh = (s * 0.18, 0, Z_SHOULDER - 0.01)
        mid = (s * 0.275, 0, 0.95)
        shirt_parts.append(capsule(sh, mid, 0.088, 0.07))           # sleeve
        shirt_parts.append(torus(mid, 0.072, 0.013,                 # cuff ring
                                 rot=(0, math.radians(70 * s), 0)))
    shirt_parts.append(sphere((0, 0, Z_SHOULDER), 0.085,
                              scale=(1.95, 1.0, 0.45)))              # shoulders
    shirt = assemble("Shirt", [(shirt_parts, mats["MAT_Shirt"])])

    # ---- Pants: hip + legs (knee + ankle cuff definition) --------------- #
    pants_parts = [box((0, 0, Z_HIP - 0.02), (0.18, 0.13, 0.10))]
    for s in (+1, -1):
        hip = (s * 0.10, 0, Z_HIP - 0.02)
        knee = (s * 0.115, 0, 0.42)
        ankle = (s * 0.125, 0, 0.10)
        pants_parts += [
            capsule(hip, knee, 0.10, 0.066),
            sphere(knee, 0.064),
            capsule(knee, ankle, 0.062, 0.052),
            torus(ankle, 0.054, 0.012, rot=(math.radians(90), 0, 0)),  # cuff
        ]
    pants = assemble("Pants", [(pants_parts, mats["MAT_Pants"])])

    # ---- Shoes: low-top sneaker (body + sole + toe cap) ----------------- #
    shoe_parts = []
    for s in (+1, -1):
        shoe_parts.append(box((s * 0.125, -0.045, 0.05), (0.052, 0.10, 0.035)))   # body
        shoe_parts.append(box((s * 0.125, -0.05, 0.018), (0.058, 0.12, 0.018)))   # sole
        shoe_parts.append(sphere((s * 0.125, -0.15, 0.05), 0.05,
                                 scale=(1.0, 1.0, 0.85), seg=14, ring=8))         # toe cap
    shoes = assemble("Shoes", [(shoe_parts, mats["MAT_Shoes"])])

    # ---- Logo (wordmark "jump" on the chest) ---------------------------- #
    logo = _make_logo(bpy, mats["MAT_Logo"])

    # ---- Shape keys (10) on Body ---------------------------------------- #
    _add_shape_keys(body)

    # ---- Armature (16 bones) + skinning --------------------------------- #
    arm = _build_armature(bpy)
    _wrap_root(bpy, arm)
    meshes = [body, hair, eyes, shirt, pants, shoes, logo]
    _skin(bpy, arm, meshes)

    # ---- Actions (9 body clips) ----------------------------------------- #
    _build_actions(bpy, arm)

    # ---- save master_v2.blend (source of truth for V2) ------------------ #
    blend_path = _abs(cfg.get("paths", {}).get("masterBlendV2")
                      or _v2_path(cfg["paths"]["masterBlend"]))
    os.makedirs(os.path.dirname(blend_path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=blend_path)
    print(f"\nmaster_v2.blend salvo: {blend_path}")


def _set_optional(bsdf, input_name, value) -> None:
    try:
        if input_name in bsdf.inputs:
            bsdf.inputs[input_name].default_value = value
    except Exception:
        pass


def _shirt_torso(bpy):
    bpy.ops.mesh.primitive_cylinder_add(vertices=22, radius=0.165, depth=0.40,
                                        location=(0, 0, 0.97))
    obj = bpy.context.active_object
    obj.scale = (1.18, 0.82, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def _make_logo(bpy, material):
    bpy.ops.object.text_add(location=(0, -0.150, 1.055))
    obj = bpy.context.active_object
    obj.name = "Logo"
    obj.data.body = "jump"
    obj.data.align_x = "CENTER"
    obj.data.align_y = "CENTER"
    obj.data.size = 0.055
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
    """10 regional facial blend shapes (functional, non-destructive).

    V1 set: Smile, Blink_L, Blink_R, Thinking, Surprised, Sad, OpenMouth.
    V2 adds: Curious, Greeting, Celebrate.
    """
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
            return (0.0, 0.0, 0.014)
        if y < -0.02 and 1.36 <= z <= 1.41 and 0.04 <= abs(x) <= 0.11:
            return (0.0, 0.0, 0.005)
        return (0, 0, 0)

    def open_mouth(x, y, z):
        if y < -0.04 and 1.28 <= z <= 1.345 and abs(x) <= 0.06:
            return (0.0, -0.008, -0.022)
        return (0, 0, 0)

    def blink(side):
        def fn(x, y, z):
            if (x * side) > 0.015 and y < -0.03 and 1.40 <= z <= 1.47 \
                    and 0.02 <= abs(x) <= 0.09:
                return (0.0, 0.0, -0.016)
            return (0, 0, 0)
        return fn

    def surprised(x, y, z):
        if y < -0.02 and 1.46 <= z <= 1.53:
            return (0.0, 0.0, 0.011)
        if y < -0.04 and 1.30 <= z <= 1.345 and abs(x) <= 0.05:
            return (0.0, -0.004, -0.009)
        return (0, 0, 0)

    def thinking(x, y, z):
        if x > 0.0 and y < -0.02 and 1.46 <= z <= 1.53 and abs(x) <= 0.09:
            return (0.0, 0.0, 0.013)
        return (0, 0, 0)

    def sad(x, y, z):
        if y < -0.04 and 1.30 <= z <= 1.37 and 0.03 <= abs(x) <= 0.10:
            return (0.0, 0.0, -0.013)
        if y < -0.02 and 1.47 <= z <= 1.52 and abs(x) <= 0.045:
            return (0.0, 0.0, 0.008)
        return (0, 0, 0)

    # --- V2 additions ---------------------------------------------------- #
    def curious(x, y, z):
        # one brow up (left side, x>0) + slight head-cock asymmetry at mouth
        if x > 0.0 and y < -0.02 and 1.46 <= z <= 1.53 and abs(x) <= 0.09:
            return (0.0, 0.0, 0.016)
        if x < 0.0 and y < -0.04 and 1.31 <= z <= 1.36 and 0.025 <= abs(x) <= 0.09:
            return (0.0, 0.0, 0.006)   # opposite corner lifts a little
        return (0, 0, 0)

    def greeting(x, y, z):
        # warm, open smile: stronger corner lift + cheeks + tiny jaw drop
        if y < -0.04 and 1.30 <= z <= 1.37 and 0.02 <= abs(x) <= 0.11:
            return (0.0, 0.0, 0.020)
        if y < -0.02 and 1.36 <= z <= 1.42 and 0.04 <= abs(x) <= 0.12:
            return (0.0, 0.0, 0.008)
        if y < -0.04 and 1.30 <= z <= 1.345 and abs(x) <= 0.05:
            return (0.0, -0.004, -0.008)
        return (0, 0, 0)

    def celebrate(x, y, z):
        # big open grin + raised cheeks + brows up (Surprised+Greeting combo)
        if y < -0.02 and 1.46 <= z <= 1.53:
            return (0.0, 0.0, 0.013)               # brows up
        if y < -0.04 and 1.30 <= z <= 1.37 and 0.02 <= abs(x) <= 0.11:
            return (0.0, 0.0, 0.022)               # corners up
        if y < -0.04 and 1.27 <= z <= 1.345 and abs(x) <= 0.06:
            return (0.0, -0.010, -0.024)           # jaw drop (open)
        return (0, 0, 0)

    make("Smile", smile)
    make("Blink_L", blink(+1))
    make("Blink_R", blink(-1))
    make("Thinking", thinking)
    make("Surprised", surprised)
    make("Sad", sad)
    make("OpenMouth", open_mouth)
    make("Curious", curious)
    make("Greeting", greeting)
    make("Celebrate", celebrate)


def _build_armature(bpy):
    from mathutils import Vector

    arm_data = bpy.data.armatures.new("Armature")
    arm = bpy.data.objects.new("Armature", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm_data.edit_bones

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
    root = bpy.data.objects.new("Nathalia", None)
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
    """9 body clips. Each starts/ends near neutral for smooth blends.

    Idle/Thinking/Explaining/Typing loop; Wave/Pointing/Celebrate/Alert/Greeting
    are one-shots. Durations land inside the master_character_config windows.
    """
    import math as _m

    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.rotation_mode = "XYZ"
    if arm.animation_data is None:
        arm.animation_data_create()

    R = _m.radians

    def neutral():
        return {b.name: (0, 0, 0) for b in arm.pose.bones}

    def key(action, frame, poses):
        arm.animation_data.action = action
        bpy.context.scene.frame_set(frame)
        for bone, euler in poses.items():
            pb = arm.pose.bones.get(bone)
            if not pb:
                continue
            pb.rotation_euler = euler
            pb.keyframe_insert("rotation_euler", frame=frame)

    actions = {}

    # ---- Idle: breathing + weight shift + arm sway (4.0 s) -------------- #
    idle = bpy.data.actions.new("Idle")
    actions["Idle"] = idle
    key(idle, 1, neutral())
    key(idle, 33, {"Spine": (R(2.5), 0, R(1)), "Head": (R(-1.5), 0, R(1.5)),
                   "Pelvis": (0, 0, R(1)),
                   "UpperArm.L": (0, 0, R(-3)), "UpperArm.R": (0, 0, R(3))})
    key(idle, 65, {"Spine": (R(1), 0, R(-1)), "Head": (R(1), 0, R(-1.5)),
                   "Pelvis": (0, 0, R(-1)),
                   "UpperArm.L": (0, 0, R(-2)), "UpperArm.R": (0, 0, R(2))})
    key(idle, 97, neutral())

    # ---- Wave: right arm raises + waves (1.5 s) ------------------------- #
    wave = bpy.data.actions.new("Wave")
    actions["Wave"] = wave
    key(wave, 1, neutral())
    key(wave, 9, {"UpperArm.R": (0, R(-35), R(70)), "LowerArm.R": (0, 0, R(35))})
    key(wave, 18, {"UpperArm.R": (0, R(-35), R(70)), "LowerArm.R": (0, 0, R(60)),
                   "Hand.R": (0, 0, R(20))})
    key(wave, 27, {"UpperArm.R": (0, R(-35), R(70)), "LowerArm.R": (0, 0, R(35)),
                   "Hand.R": (0, 0, R(-20))})
    key(wave, 37, neutral())

    # ---- Thinking: hand to chin + head tilt (2.2 s) --------------------- #
    think = bpy.data.actions.new("Thinking")
    actions["Thinking"] = think
    key(think, 1, neutral())
    key(think, 15, {"UpperArm.R": (0, R(-20), R(38)), "LowerArm.R": (0, 0, R(95)),
                    "Head": (R(6), 0, R(-6))})
    key(think, 40, {"UpperArm.R": (0, R(-20), R(38)), "LowerArm.R": (0, 0, R(95)),
                    "Head": (R(6), 0, R(-6))})
    key(think, 54, neutral())

    # ---- Pointing: right arm extends forward, holds (1.5 s) ------------- #
    point = bpy.data.actions.new("Pointing")
    actions["Pointing"] = point
    key(point, 1, neutral())
    key(point, 10, {"UpperArm.R": (R(-55), 0, R(18)), "LowerArm.R": (R(-10), 0, 0),
                    "Head": (R(3), 0, R(-3)), "Spine": (0, 0, R(-2))})
    key(point, 30, {"UpperArm.R": (R(-55), 0, R(18)), "LowerArm.R": (R(-10), 0, 0),
                    "Head": (R(3), 0, R(-3)), "Spine": (0, 0, R(-2))})
    key(point, 37, neutral())

    # ---- Explaining: both hands open, rhythmic gesture (2.0 s) ---------- #
    explain = bpy.data.actions.new("Explaining")
    actions["Explaining"] = explain
    key(explain, 1, {"UpperArm.L": (R(-25), 0, R(-22)), "LowerArm.L": (R(-30), 0, 0),
                     "UpperArm.R": (R(-25), 0, R(22)), "LowerArm.R": (R(-30), 0, 0)})
    key(explain, 17, {"UpperArm.L": (R(-30), 0, R(-30)), "LowerArm.L": (R(-45), 0, 0),
                      "UpperArm.R": (R(-20), 0, R(16)), "LowerArm.R": (R(-22), 0, 0),
                      "Head": (0, 0, R(2))})
    key(explain, 33, {"UpperArm.L": (R(-20), 0, R(-16)), "LowerArm.L": (R(-22), 0, 0),
                      "UpperArm.R": (R(-30), 0, R(30)), "LowerArm.R": (R(-45), 0, 0),
                      "Head": (0, 0, R(-2))})
    key(explain, 49, {"UpperArm.L": (R(-25), 0, R(-22)), "LowerArm.L": (R(-30), 0, 0),
                      "UpperArm.R": (R(-25), 0, R(22)), "LowerArm.R": (R(-30), 0, 0)})

    # ---- Celebrate: both arms up, little hop of the spine (1.75 s) ------ #
    celebrate = bpy.data.actions.new("Celebrate")
    actions["Celebrate"] = celebrate
    key(celebrate, 1, neutral())
    key(celebrate, 12, {"UpperArm.L": (0, 0, R(-150)), "UpperArm.R": (0, 0, R(150)),
                        "LowerArm.L": (R(-20), 0, 0), "LowerArm.R": (R(-20), 0, 0),
                        "Spine": (R(-4), 0, 0), "Head": (R(-6), 0, 0)})
    key(celebrate, 26, {"UpperArm.L": (0, 0, R(-140)), "UpperArm.R": (0, 0, R(140)),
                        "LowerArm.L": (R(-10), 0, 0), "LowerArm.R": (R(-10), 0, 0),
                        "Spine": (R(-2), 0, 0), "Head": (R(-3), 0, 0)})
    key(celebrate, 43, neutral())

    # ---- Typing: hands forward-low, small alternating taps (1.5 s) ------ #
    typing = bpy.data.actions.new("Typing")
    actions["Typing"] = typing
    base = {"UpperArm.L": (R(-38), 0, R(-8)), "LowerArm.L": (R(-55), 0, 0),
            "UpperArm.R": (R(-38), 0, R(8)), "LowerArm.R": (R(-55), 0, 0),
            "Spine": (R(4), 0, 0), "Head": (R(8), 0, 0)}
    key(typing, 1, base)
    tap_l = dict(base); tap_l["Hand.L"] = (R(-12), 0, 0)
    key(typing, 10, tap_l)
    tap_r = dict(base); tap_r["Hand.R"] = (R(-12), 0, 0)
    key(typing, 19, tap_r)
    key(typing, 28, dict(base, **{"Hand.L": (R(-10), 0, 0)}))
    key(typing, 37, base)

    # ---- Alert: quick recoil + tense, head back (1.2 s) ----------------- #
    alert = bpy.data.actions.new("Alert")
    actions["Alert"] = alert
    key(alert, 1, neutral())
    key(alert, 6, {"Spine": (R(-5), 0, 0), "Head": (R(-7), 0, 0),
                   "UpperArm.L": (0, 0, R(-10)), "UpperArm.R": (0, 0, R(10))})
    key(alert, 16, {"Spine": (R(-2), 0, 0), "Head": (R(-2), 0, 0)})
    key(alert, 29, neutral())

    # ---- Greeting: friendly raised-hand "oi" + nod/lean (1.6 s) --------- #
    greeting = bpy.data.actions.new("Greeting")
    actions["Greeting"] = greeting
    key(greeting, 1, neutral())
    key(greeting, 10, {"UpperArm.R": (0, R(-25), R(78)), "LowerArm.R": (0, 0, R(28)),
                       "Hand.R": (0, 0, R(15)), "Head": (R(5), 0, R(4)),
                       "Spine": (R(3), 0, R(2))})
    key(greeting, 24, {"UpperArm.R": (0, R(-25), R(78)), "LowerArm.R": (0, 0, R(45)),
                       "Hand.R": (0, 0, R(-12)), "Head": (R(5), 0, R(4)),
                       "Spine": (R(3), 0, R(2))})
    key(greeting, 39, neutral())

    # persist actions in the .blend and stash on NLA so they export
    for act in actions.values():
        act.use_fake_user = True
        track = arm.animation_data.nla_tracks.new()
        track.name = act.name
        track.strips.new(act.name, int(act.frame_range[0]), act)

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
    print("\n=== VALIDAÇÃO V2 (cena viva) ===")
    for section, module in report_master.VALIDATORS:
        rep = module.validate_scene(cfg, None)
        rep.finish()
        print()
        reports.append((section, rep))
    final = pc.worst(*[r.verdict() for _, r in reports])
    print(f"== RESULTADO CONSOLIDADO: {final} ==")

    out_dir = _abs(cfg["paths"]["reportsDir"])
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "MASTER_V2_VALIDATION_RAW.md")
    md = report_master.render_markdown("master_v2.blend (cena viva)", reports, final)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(md)
    print(f"relatório escrito: {out_path}")
    return 1 if final == pc.FAIL else 0


def _export_preview(cfg) -> None:
    import bpy
    models_dir = os.path.dirname(cfg["paths"]["masterGlb"])
    out = _abs(os.path.join(models_dir, "master_v2_preview.glb"))
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
    print(f"master_v2_preview.glb exportado: {out}  ("
          f"{round(os.path.getsize(out)/1024, 1)} KB)")


def _render_thumbnails(cfg) -> None:
    import bpy
    from mathutils import Vector

    out_dir = _abs(os.path.join(cfg["paths"]["previewDir"], "v2"))
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
    print("== construct_master_v2.py ==")
    print("Constrói o master_v2.blend refinado da Nathal.IA (Fase 7).")
    print(f"  objetos   : {cfg['objects']} (7, contrato preservado)")
    print(f"  materiais : {cfg['materials']} (7, contrato preservado)")
    print(f"  shapeKeys : {cfg['shapeKeys']}")
    print(f"  actions   : {[a['name'] for a in cfg['actions']]}")
    print("  face      : sobrancelhas + íris + boca (dentro de Body, MAT_Hair)")
    print("  cabelo    : volume maior, franja assimétrica, mechas extras")
    print("  roupa     : gola careca, punhos, solado/biqueira do tênis")
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

    print("== construct_master_v2.py (APPLY) ==")
    _build(cfg)
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
