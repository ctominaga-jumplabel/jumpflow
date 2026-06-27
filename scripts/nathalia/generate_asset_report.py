#!/usr/bin/env python3
"""Generate a markdown intake report for a Nathal.IA .glb candidate.

Runs the shared validation (``glb_metrics.py``) and writes a per-file report to
the intake reports dir (``assets/nathalia/reports/<file>.report.md`` by default).
The report consolidates what was measured and the recommended decision, so the
human-facing ``docs/nathalia/ASSET_INTAKE_REPORT.md`` can cite it.

Like the other scripts it works in two modes (Blender / structural) and never
modifies the input. Geometry-only fields are reported as "?" outside Blender,
with a clear note — never a silent pass.

Usage:
    python generate_asset_report.py <path-to.glb> [--out <dir-or-file.md>]
    blender --background --python generate_asset_report.py -- <path-to.glb>

Exit codes: 0 = report written, 1 = file missing / unreadable, 2 = bad args.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

import glb_metrics as gm  # noqa: E402

# Repo root = two levels up from scripts/nathalia/.
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def parse_args(argv: list[str]) -> dict:
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = argv[1:]
    path = None
    out = None
    date = None
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg == "--out" and i + 1 < len(argv):
            out = argv[i + 1]
            i += 2
            continue
        if arg == "--date" and i + 1 < len(argv):
            date = argv[i + 1]
            i += 2
            continue
        if not arg.startswith("--") and path is None:
            path = arg
        i += 1
    return {"path": path, "out": out, "date": date}


def resolve_out_path(path: str, out: str | None, cfg: dict) -> str:
    base = os.path.basename(path)
    report_name = f"{base}.report.md"
    if out is None:
        reports_dir = os.path.join(REPO_ROOT, cfg["intake"]["reportsDir"])
    elif out.endswith(".md"):
        return out
    else:
        reports_dir = out
    os.makedirs(reports_dir, exist_ok=True)
    return os.path.join(reports_dir, report_name)


def _yn(value) -> str:
    if value is None:
        return "—"
    return "sim" if value else "não"


def _cell(value) -> str:
    return "—" if value is None else str(value)


def build_markdown(metrics: dict, result: dict, cfg: dict, date: str | None) -> str:
    c = metrics["counts"]
    poly = cfg["polycount"]
    lines: list[str] = []
    a = lines.append

    a(f"# Relatório de intake — `{metrics['fileName']}`")
    a("")
    a("> Gerado por `scripts/nathalia/generate_asset_report.py` "
      "(Fase 3A — Asset Intake & Technical Validation).")
    a("> Não-destrutivo; o arquivo de origem não foi modificado.")
    a("")
    a("## Identificação")
    a("")
    a("| Campo | Valor |")
    a("| --- | --- |")
    a(f"| Arquivo | `{metrics['fileName']}` |")
    a(f"| Caminho | `{metrics['path']}` |")
    a("| Origem | Tripo |")
    a("| Status | raw candidate |")
    a(f"| Data da análise | {date or '(preencher)'} |")
    a(f"| Modo de análise | {metrics['mode']} |")
    a(f"| Tamanho do arquivo | {metrics['fileSizeHuman']} |")
    a("")

    a("## Métricas")
    a("")
    a("| Métrica | Valor | Referência (contrato) |")
    a("| --- | --- | --- |")
    a(f"| Objetos | {_cell(c['objects'])} | separáveis (corpo/cabelo/roupa…) |")
    a(f"| Meshes | {_cell(c['meshes'])} | — |")
    a(f"| Materiais | {_cell(c['materials'])} | {len(cfg['materials'])} nomeados esperados |")
    a(f"| Triângulos | {_cell(c['triangles'])} | mvp ≤ {poly['mvpMaxTris']}, ideal ≤ {poly['idealMaxTris']}, máx {poly['hardMaxTris']} |")
    a(f"| Vértices | {_cell(c['vertices'])} | — |")
    a(f"| Animações | {_cell(c['animations'])} | nenhuma no bruto (rig vem no Blender) |")
    a(f"| Shape keys | {_cell(c['shapeKeys'])} | {len(cfg['shapeKeys'])} esperadas (Fase 4) |")
    a(f"| Texturas | {_cell(c['textures'])} | evitar excesso; preferir atlas |")
    a("")

    a("## Presença de recursos")
    a("")
    a(f"- Possui rig/armature: **{_yn(metrics['hasRig'])}**")
    a(f"- Possui animações: **{_yn(metrics['hasAnimations'])}**")
    a(f"- Possui shape keys: **{_yn(metrics['hasShapeKeys'])}**")
    if metrics.get("dimensions"):
        d = metrics["dimensions"]
        a(f"- Dimensões aproximadas (unidades Blender): x={d['x']} y={d['y']} z={d['z']}")
    a("")

    a("### Listas")
    a("")
    _md_list(a, "Objetos", metrics["objectsList"])
    _md_list(a, "Materiais", metrics["materialsList"])
    _md_list(a, "Animações", metrics["animationsList"])
    _md_list(a, "Shape keys", metrics["shapeKeysList"])
    _md_list(a, "Ossos do rig", metrics["armatureBones"])

    a("## Problemas encontrados")
    a("")
    if result["hardFails"]:
        a("**Violações duras (reprovam):**")
        a("")
        for f in result["hardFails"]:
            a(f"- ❌ {f}")
        a("")
    if result["warnings"]:
        a("**Avisos:**")
        a("")
        for w in result["warnings"]:
            a(f"- ⚠️ {w}")
        a("")
    if not result["hardFails"] and not result["warnings"]:
        a("- Nenhum problema detectado pela validação automática.")
        a("")
    if metrics["notes"]:
        a("**Notas:**")
        a("")
        for note in metrics["notes"]:
            a(f"- {note}")
        a("")

    a("## Decisão recomendada (automática)")
    a("")
    a(f"> **{result['decisionHint']}**")
    a("")
    a("Opções possíveis (a decisão final é humana, contra o "
      "[Character Bible](../../docs/nathalia/CHARACTER_BIBLE.md) e o "
      "[checklist de aceite](../../docs/nathalia/MASTER_GLB_ACCEPTANCE_CHECKLIST.md)):")
    a("")
    a(f"- {gm.DECISION_ACCEPT}")
    a(f"- {gm.DECISION_REFERENCE}")
    a(f"- {gm.DECISION_REJECT}")
    a(f"- {gm.DECISION_NEW_SHEET}")
    a("")
    if metrics["mode"] == "structural":
        a("> ⚠️ **Validação estrutural** (sem Blender): triângulos, vértices, "
          "dimensões e rig não foram medidos. Rode no Blender para um veredito "
          "completo:")
        a("> ")
        a(f"> `blender --background --python scripts/nathalia/validate_glb.py -- {metrics['path']}`")
        a("")

    a("---")
    a("")
    a("_Decisão final tomada por (preencher):_ ______  ·  _Data:_ ______")
    a("")
    return "\n".join(lines)


def _md_list(append, label: str, items: list[str]) -> None:
    append(f"**{label}** ({len(items)}):")
    append("")
    if items:
        append("```")
        for name in items:
            append(name)
        append("```")
    else:
        append("- (nenhum)")
    append("")


def main() -> int:
    args = parse_args(sys.argv)
    cfg = gm.load_config()

    if not args["path"]:
        print("ERROR: informe o caminho do .glb.")
        print("uso: python scripts/nathalia/generate_asset_report.py <arquivo.glb> [--out <dir>]")
        return 2
    if not os.path.exists(args["path"]):
        print(f"ERROR: arquivo não encontrado: {args['path']}")
        print("Baixe o .glb do Tripo para assets/nathalia/raw/ antes de gerar o relatório.")
        return 1

    metrics = gm.collect_metrics(args["path"])
    result = gm.evaluate(metrics, cfg)
    md = build_markdown(metrics, result, cfg, args["date"])

    out_path = resolve_out_path(args["path"], args["out"], cfg)
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(md)

    print(f"Relatório escrito em: {out_path}")
    print(f"Decisão recomendada: {result['decisionHint']}")
    if result["hardFails"]:
        print(f"Violações duras: {len(result['hardFails'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
