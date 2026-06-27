#!/usr/bin/env python3
"""Run every Nathal.IA validator and emit one consolidated report.

Orchestrates ``validate_master``, ``validate_rig``, ``validate_shape_keys`` and
``validate_actions`` against the live Blender scene (or an imported ``.glb``),
combines their verdicts and prints a single PASS / WARNING / FAIL. With
``--write`` it also renders a markdown report under ``paths.reportsDir`` using
the structure of ``docs/nathalia/reports/MASTER_VALIDATION_TEMPLATE.md``.

Behaviour: inside Blender it really runs the validators; outside Blender it
prints the plan and exits 0 (it cannot inspect geometry without bpy).

Usage:
    blender --background --python report_master.py                 # live scene
    blender --background --python report_master.py -- master.glb   # a .glb
    blender --background --python report_master.py -- --write      # + md file
    python report_master.py                                        # plan only

Exit codes: 0 = PASS/WARNING, 1 = FAIL.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import pipeline_common as pc  # noqa: E402
import validate_actions  # noqa: E402
import validate_master  # noqa: E402
import validate_rig  # noqa: E402
import validate_shape_keys  # noqa: E402

VALIDATORS = [
    ("Objetos & Materiais", validate_master),
    ("Rig", validate_rig),
    ("Shape Keys", validate_shape_keys),
    ("Actions", validate_actions),
]


def render_markdown(target: str, reports: list[tuple[str, pc.Report]], final: str) -> str:
    lines = [
        f"# Master Validation Report — Nathal.IA `{os.path.basename(target)}`",
        "",
        "> Gerado por `report_master.py`. Modelo em "
        "`MASTER_VALIDATION_TEMPLATE.md`.",
        "",
        "## Resumo",
        "",
        "| Campo | Valor |",
        "| --- | --- |",
        f"| Alvo | `{target}` |",
        "| Modo | Blender |",
        f"| Resultado final | **{final}** |",
        "",
    ]
    for section, rep in reports:
        lines.append(f"## {section}")
        lines.append("")
        lines.append("| Verificação | Status | Detalhe |")
        lines.append("| --- | --- | --- |")
        for label, status, detail in rep.checks:
            lines.append(f"| {label} | {status} | {detail or ''} |")
        lines.append("")
        lines.append(f"Status: **{rep.verdict()}**")
        lines.append("")
    lines += [
        "## Resultado Final",
        "",
        f"**{final}**",
        "",
        "Aceite formal: `../MASTER_GLB_ACCEPTANCE_CHECKLIST.md` (ADR-010).",
        "",
    ]
    return "\n".join(lines)


def main() -> int:
    cfg = pc.load_config()
    args = pc.parse_args(sys.argv, flags=("--write",))

    if not pc.in_blender():
        return pc.no_blender_plan(
            "report_master.py", cfg,
            [
                "roda os 4 validadores e consolida PASS/WARNING/FAIL:",
                "  - validate_master (objetos, materiais, transform)",
                "  - validate_rig (armature, bones, hierarquia)",
                "  - validate_shape_keys (existência, duplicatas)",
                "  - validate_actions (existência, duração, nomes)",
                "use --write para gerar o .md em " + cfg["paths"]["reportsDir"],
            ],
        )

    target = args["path"] or "cena ativa"
    reports: list[tuple[str, pc.Report]] = []
    print("== report_master.py ==\n")
    for section, module in VALIDATORS:
        rep = module.validate_scene(cfg, args["path"])
        rep.finish()
        print()
        reports.append((section, rep))

    final = pc.worst(*[rep.verdict() for _, rep in reports])
    print(f"== RESULTADO CONSOLIDADO: {final} ==")

    if args["write"]:
        out_dir = cfg["paths"]["reportsDir"]
        os.makedirs(os.path.abspath(out_dir), exist_ok=True)
        out_path = os.path.join(out_dir, "MASTER_VALIDATION_latest.md")
        with open(out_path, "w", encoding="utf-8") as fh:
            fh.write(render_markdown(target, reports, final))
        print(f"relatório escrito: {out_path}")

    return 1 if final == pc.FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
