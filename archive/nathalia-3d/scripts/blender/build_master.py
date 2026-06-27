#!/usr/bin/env python3
"""Orchestrate the full Nathal.IA master character build pipeline (Fase 4).

PHASE 4 STATUS: prepared structure. This is the single entry point that chains
the build steps end to end. It **does not generate a real master.glb** yet — the
reconstruction steps (retopo/split/rig/shape keys/actions) are manual Blender
work (Fase 5). What this script provides today is the orchestrated skeleton:
it prints the plan, and inside Blender it can run the validation + report stages
against whatever scene is loaded.

Pipeline (see docs/nathalia/MASTER_CHARACTER_BUILD_PLAN.md):

    import reference  ->  normalize  ->  validate objects/materials
                                     ->  validate rig
                                     ->  validate shape keys
                                     ->  validate actions
                                     ->  report
                                     ->  export master.glb

Stages marked [manual] are human Blender work in Fase 5; stages marked [auto]
are wired here.

Usage:
    blender --background --python build_master.py             # run validate+report
    blender --background --python build_master.py -- --export # also export (Fase 5)
    python build_master.py                                    # print the plan

Exit codes: 0 = ok, 1 = a validation FAILed or export requested without a scene.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402

STEPS = [
    ("1. Referência (v02)", "auto", "guia de proporção/silhueta (construct_master)"),
    ("2. Reconstrução game-ready", "auto", "geometria paramétrica low-poly (construct_master)"),
    ("3. Separação de objetos", "auto", "7 objetos nomeados (construct_master)"),
    ("4. Materiais", "auto", "7 materiais MAT_* (construct_master)"),
    ("5. Rig", "auto", "Armature 16 bones + skinning (construct_master)"),
    ("6. Shape Keys", "auto", "7 shape keys (construct_master)"),
    ("7. Actions", "auto", "Idle/Wave/Thinking MVP (construct_master)"),
    ("8. Validação", "auto", "validate_* + report_master"),
    ("9. Export preview", "auto", "master_preview.glb + thumbnails (construct_master)"),
]


def print_plan(cfg: dict) -> None:
    print("Pipeline (MASTER_CHARACTER_BUILD_PLAN.md):")
    for title, kind, detail in STEPS:
        tag = "[auto]" if kind == "auto" else "[manual]"
        print(f"  {tag:8} {title} — {detail}")
    print(f"\nreferência: {cfg['paths']['reference']}")
    print(f"saída     : {cfg['paths']['masterGlb']}")


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv, flags=("--export", "--construct"))

    print("== build_master.py ==")
    print_plan(cfg)

    if not pc.in_blender():
        print("\nSem Blender (bpy): apenas o plano acima foi exibido.")
        print("Rode dentro do Blender para executar as etapas [auto].")
        print("Etapas 1–7 (construção) estão em construct_master.py:")
        print("  blender --background --python construct_master.py -- --apply")
        return 0

    # Fase 5: construct_master.py builds the real master.blend (etapas 1–7) and
    # already runs validation + preview export + thumbnails under --apply.
    if args["construct"]:
        import construct_master

        print("\n--- Etapas 1–9: construct_master (build + validação + preview) ---")
        sys.argv = [sys.argv[0], "--", "--apply"]
        return construct_master.main()

    # [auto] stage 8: run the consolidated validation/report.
    import report_master

    print("\n--- Etapa 8: validação ---")
    code = report_master.main()

    if args["export"]:
        print("\n--- Etapa 9: export ---")
        import export_master_glb

        # export only when explicitly applied; build_master never forces it.
        sys.argv = [sys.argv[0], "--", "--apply"]
        code = pc.worst(
            pc.FAIL if code else pc.PASS,
            pc.FAIL if export_master_glb.main() else pc.PASS,
        )
        return 1 if code == pc.FAIL else 0

    print("\nEtapa 9 (export) não solicitada (--export). Nada foi escrito.")
    return code


if __name__ == "__main__":
    sys.exit(main())
