#!/usr/bin/env python3
"""Shared metrics + evaluation for Nathal.IA .glb files.

This module is the single place that *measures* a ``.glb`` and *judges* it
against the asset contract (``nathalia_assets.config.json`` /
``docs/nathalia/GLB_REQUIREMENTS.md``). It is imported by:

  * ``inspect_glb.py``           — human-readable description
  * ``validate_glb.py``          — pass/fail against the contract
  * ``generate_asset_report.py`` — writes a markdown intake report

It works in two modes:

  * **Blender mode** (``bpy`` importable): imports the ``.glb`` and extracts full
    geometry — triangles, vertices, dimensions, armature/rig, shape keys.
  * **Structural mode** (no Blender): parses the ``.glb`` JSON chunk only —
    counts of meshes/materials/animations/skins, names, file size. Geometry
    fields (triangles, vertices, dimensions) are ``None`` and flagged.

Nothing here ever mutates the file. Following D-009, name mismatches are
*warnings*; only hard violations (invalid glTF, polycount over the hard max)
are fatal.
"""
from __future__ import annotations

import json
import os
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "nathalia_assets.config.json")

# --- decision recommendations (mirrors ASSET_INTAKE_REPORT.md options) ---
DECISION_ACCEPT = "aceitar para refinamento"
DECISION_REFERENCE = "aceitar apenas como referência visual"
DECISION_REJECT = "rejeitar e gerar novo Tripo"
DECISION_NEW_SHEET = "gerar novo Character Sheet antes de outro Tripo"
DECISION_MANUAL = "revisão humana necessária (resultado ambíguo)"


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def in_blender() -> bool:
    try:
        import bpy  # noqa: F401

        return True
    except Exception:
        return False


def human_bytes(num: int | None) -> str:
    if num is None:
        return "?"
    size = float(num)
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size:.1f} GB"


def _empty_metrics(path: str, mode: str) -> dict:
    size = os.path.getsize(path) if os.path.exists(path) else None
    return {
        "path": path,
        "fileName": os.path.basename(path),
        "mode": mode,
        "fileBytes": size,
        "fileSizeHuman": human_bytes(size),
        "counts": {
            "objects": None,
            "meshes": None,
            "materials": None,
            "triangles": None,
            "vertices": None,
            "animations": None,
            "shapeKeys": None,
            "armatures": None,
            "skins": None,
            "textures": None,
            "images": None,
        },
        "objectsList": [],
        "meshesList": [],
        "materialsList": [],
        "animationsList": [],
        "shapeKeysList": [],
        "armatureBones": [],
        "hasRig": None,
        "hasAnimations": None,
        "hasShapeKeys": None,
        "dimensions": None,  # {"x","y","z"} in metres (Blender only)
        "minZ": None,        # lowest point, used to check origin-on-floor
        "notes": [],
    }


# --------------------------------------------------------------------------- #
# Blender mode
# --------------------------------------------------------------------------- #
def collect_metrics_bpy(path: str) -> dict:
    import bpy

    m = _empty_metrics(path, "blender")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    try:
        bpy.ops.import_scene.gltf(filepath=path)
    except Exception as exc:  # invalid glTF -> caller treats as hard fail
        m["notes"].append(f"FATAL: could not import glTF: {exc}")
        m["importError"] = str(exc)
        return m

    objects = list(bpy.data.objects)
    meshes = [o for o in objects if o.type == "MESH"]
    armatures = [o for o in objects if o.type == "ARMATURE"]

    m["objectsList"] = sorted(o.name for o in objects)
    m["meshesList"] = sorted(o.name for o in meshes)
    m["materialsList"] = sorted(mat.name for mat in bpy.data.materials)
    m["animationsList"] = sorted(a.name for a in bpy.data.actions)

    shape_keys: list[str] = []
    for mesh in bpy.data.meshes:
        if mesh.shape_keys:
            for kb in mesh.shape_keys.key_blocks:
                if kb.name != "Basis":
                    shape_keys.append(kb.name)
    m["shapeKeysList"] = sorted(set(shape_keys))

    bones: list[str] = []
    for arm in armatures:
        bones.extend(b.name for b in arm.data.bones)
    m["armatureBones"] = sorted(set(bones))

    # Geometry: triangles + vertices from evaluated meshes.
    tris = 0
    verts = 0
    for obj in meshes:
        mesh = obj.data
        verts += len(mesh.vertices)
        for poly in mesh.polygons:
            tris += max(0, poly.loop_total - 2)

    # Overall bounding box (world space) for dimensions + floor check.
    min_v = [float("inf")] * 3
    max_v = [float("-inf")] * 3
    found_geo = False
    for obj in meshes:
        for corner in obj.bound_box:
            world = obj.matrix_world @ _as_vector(corner)
            found_geo = True
            for i in range(3):
                min_v[i] = min(min_v[i], world[i])
                max_v[i] = max(max_v[i], world[i])

    m["counts"].update(
        {
            "objects": len(objects),
            "meshes": len(meshes),
            "materials": len(bpy.data.materials),
            "triangles": tris,
            "vertices": verts,
            "animations": len(bpy.data.actions),
            "shapeKeys": len(m["shapeKeysList"]),
            "armatures": len(armatures),
            "textures": len(bpy.data.textures),
            "images": len([img for img in bpy.data.images if img.name != "Render Result"]),
        }
    )
    m["hasRig"] = len(armatures) > 0
    m["hasAnimations"] = len(bpy.data.actions) > 0
    m["hasShapeKeys"] = len(m["shapeKeysList"]) > 0
    if found_geo:
        m["dimensions"] = {
            "x": round(max_v[0] - min_v[0], 4),
            "y": round(max_v[1] - min_v[1], 4),
            "z": round(max_v[2] - min_v[2], 4),
        }
        # Blender up-axis is Z; glTF up is Y. After import three.js sees Y-up,
        # but inside Blender the imported scene is Z-up, so "floor" is min Z.
        m["minZ"] = round(min_v[2], 4)
    return m


def _as_vector(corner):
    # bound_box corners are plain sequences; wrap for matrix multiply.
    from mathutils import Vector

    return Vector((corner[0], corner[1], corner[2]))


# --------------------------------------------------------------------------- #
# Structural mode (no Blender)
# --------------------------------------------------------------------------- #
def collect_metrics_structural(path: str) -> dict:
    m = _empty_metrics(path, "structural")
    try:
        with open(path, "rb") as fh:
            header = fh.read(12)
            if len(header) < 12 or header[:4] != b"glTF":
                m["notes"].append("Não é um .glb binário (sem magic 'glTF').")
                m["importError"] = "not a binary glb"
                return m
            _magic, version, _length = struct.unpack("<4sII", header)
            m["glbVersion"] = version
            chunk_len, chunk_type = struct.unpack("<II", fh.read(8))
            if chunk_type != 0x4E4F534A:  # 'JSON'
                m["notes"].append("Primeiro chunk não é JSON; não dá para resumir.")
                m["importError"] = "first chunk not JSON"
                return m
            gltf = json.loads(fh.read(chunk_len).decode("utf-8"))
    except Exception as exc:
        m["notes"].append(f"FATAL: não foi possível ler o .glb: {exc}")
        m["importError"] = str(exc)
        return m

    def names(key: str) -> list[str]:
        return [n.get("name", "<sem-nome>") for n in gltf.get(key, [])]

    m["meshesList"] = names("meshes")
    m["materialsList"] = names("materials")
    m["animationsList"] = names("animations")
    # In glTF, nodes are the "objects"; meshes are the geometry containers.
    m["objectsList"] = names("nodes")

    # Shape keys exist when meshes have morph targets ("targets").
    morph_count = 0
    for mesh in gltf.get("meshes", []):
        for prim in mesh.get("primitives", []):
            morph_count += len(prim.get("targets", []) or [])
    skins = gltf.get("skins", [])

    m["counts"].update(
        {
            "objects": len(gltf.get("nodes", [])),
            "meshes": len(gltf.get("meshes", [])),
            "materials": len(gltf.get("materials", [])),
            "animations": len(gltf.get("animations", [])),
            "shapeKeys": morph_count,
            "armatures": len(skins),
            "skins": len(skins),
            "textures": len(gltf.get("textures", [])),
            "images": len(gltf.get("images", [])),
        }
    )
    m["hasRig"] = len(skins) > 0
    m["hasAnimations"] = len(gltf.get("animations", [])) > 0
    m["hasShapeKeys"] = morph_count > 0
    m["notes"].append(
        "Modo estrutural: triângulos, vértices e dimensões exigem Blender."
    )
    return m


# --------------------------------------------------------------------------- #
# Entry point + evaluation
# --------------------------------------------------------------------------- #
def collect_metrics(path: str) -> dict:
    """Pick the best available mode and return rich metrics for ``path``."""
    if in_blender():
        return collect_metrics_bpy(path)
    return collect_metrics_structural(path)


def evaluate(metrics: dict, cfg: dict) -> dict:
    """Judge metrics against the contract. Returns alerts + a decision hint.

    Tolerant (D-009): missing names are warnings; only hard violations fail.
    """
    warnings: list[str] = []
    hard_fails: list[str] = []

    if metrics.get("importError"):
        hard_fails.append(f"Arquivo inválido: {metrics['importError']}")

    counts = metrics["counts"]

    # --- polycount ---
    tris = counts.get("triangles")
    poly = cfg["polycount"]
    if tris is not None:
        if tris > poly["hardMaxTris"]:
            hard_fails.append(
                f"polycount {tris} acima do máximo permitido {poly['hardMaxTris']}"
            )
        elif tris > poly["idealMaxTris"]:
            warnings.append(
                f"polycount {tris} acima do ideal web {poly['idealMaxTris']}"
            )
        elif tris > poly["mvpMaxTris"]:
            warnings.append(
                f"polycount {tris} acima do alvo MVP {poly['mvpMaxTris']} (ok, dentro do ideal)"
            )

    # --- file size ---
    size = metrics.get("fileBytes")
    budget = cfg["fileBudget"]
    if size is not None and size > budget["targetMaxBytes"]:
        warnings.append(
            f"arquivo {human_bytes(size)} acima do orçamento "
            f"{human_bytes(budget['targetMaxBytes'])} (compressão/Draco na Fase 4)"
        )

    # --- separability (objects/materials) ---
    n_obj = counts.get("objects")
    n_mat = counts.get("materials")
    if n_obj is not None and n_obj <= 1:
        warnings.append(
            "modelo parece ser um único objeto — dificulta separar partes "
            "(corpo/cabelo/roupa) para materiais e logo"
        )
    if n_mat is not None and n_mat <= 1:
        warnings.append(
            "apenas 1 material — provável textura única; aplicar o logo jump e "
            "materiais nomeados exigirá retrabalho no Blender"
        )

    # --- tolerant name diffs ---
    warnings += _name_diff("objects", cfg["objects"], metrics["objectsList"])
    warnings += _name_diff("materials", cfg["materials"], metrics["materialsList"])
    warnings += _name_diff("animations", cfg["animations"], metrics["animationsList"])
    warnings += _name_diff("shapeKeys", cfg["shapeKeys"], metrics["shapeKeysList"])

    # --- rig presence (informational; raw Tripo usually has none) ---
    if metrics.get("hasRig") is False:
        warnings.append("sem armature/rig — esperado num bruto do Tripo; rig vem no Blender")

    # --- textures ---
    n_tex = counts.get("textures")
    if n_tex is not None and n_tex > 4:
        warnings.append(f"{n_tex} texturas — risco de excesso; preferir atlas único")

    # --- origin on floor (Blender only) ---
    min_z = metrics.get("minZ")
    if min_z is not None and abs(min_z) > 0.05:
        warnings.append(
            f"base não está no chão (min Z = {min_z}); normalizar origem na Fase 4"
        )

    decision = _decision_hint(metrics, hard_fails, warnings)
    return {"warnings": warnings, "hardFails": hard_fails, "decisionHint": decision}


def _name_diff(label: str, expected: list[str], found: list[str]) -> list[str]:
    found_set = set(found)
    missing = [n for n in expected if n not in found_set]
    if missing:
        return [f"{label}: faltando nomes esperados {missing} (tolerante; reconciliar no Blender)"]
    return []


def _decision_hint(metrics: dict, hard_fails: list[str], warnings: list[str]) -> str:
    if metrics.get("importError"):
        return DECISION_REJECT
    if hard_fails:
        # Over polycount or otherwise broken: usually a new generation is needed.
        return DECISION_REJECT
    n_obj = metrics["counts"].get("objects")
    n_mat = metrics["counts"].get("materials")
    single_blob = (n_obj is not None and n_obj <= 1) and (n_mat is not None and n_mat <= 1)
    if single_blob:
        return DECISION_REFERENCE
    if len(warnings) > 6:
        return DECISION_MANUAL
    return DECISION_ACCEPT
