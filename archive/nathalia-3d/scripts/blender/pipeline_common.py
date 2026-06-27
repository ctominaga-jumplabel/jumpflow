#!/usr/bin/env python3
"""Shared helpers for the Nathal.IA Blender build pipeline (Fase 4).

This module is the single place that loads the build contract
(``master_character_config.json``), parses CLI args, detects Blender and formats
validation reports. It mirrors the role ``glb_metrics.py`` plays for the intake
scripts: keep measurement/parsing logic in one place so every validator stays
consistent.

All validators in this folder degrade gracefully:
  * **Inside Blender** (``bpy`` available): they inspect the live scene (the
    ``master.blend`` being built) or a ``.glb`` passed on the CLI.
  * **Outside Blender**: they print the contract they *would* enforce and exit
    without error — never a silent pass.

Nothing here ever mutates a file. Following D-009, name mismatches are
*warnings*; only hard violations are fatal.

Status statuses: ``PASS`` / ``WARNING`` / ``FAIL``.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "master_character_config.json")

PASS = "PASS"
WARNING = "WARNING"
FAIL = "FAIL"

# Severity order so we can combine many check results into one verdict.
_RANK = {PASS: 0, WARNING: 1, FAIL: 2}


def load_config() -> dict:
    with open(CONFIG_PATH, "r", encoding="utf-8") as fh:
        return json.load(fh)


def in_blender() -> bool:
    try:
        import bpy  # noqa: F401

        return True
    except Exception:
        return False


def parse_args(argv: list[str], flags: tuple[str, ...] = ()) -> dict:
    """Parse ``-- <path> [--flag ...]`` style args.

    Everything after ``--`` (Blender's separator) is treated as script args.
    Returns ``{"path": str|None, <flag-without-dashes>: bool, ...}``.
    """
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = argv[1:]
    out: dict = {"path": None}
    for flag in flags:
        out[flag.lstrip("-")] = False
    for arg in argv:
        if arg in flags:
            out[arg.lstrip("-")] = True
        elif not arg.startswith("--") and out["path"] is None:
            out["path"] = arg
    return out


def worst(*statuses: str) -> str:
    """Combine statuses into the most severe one (FAIL > WARNING > PASS)."""
    if not statuses:
        return PASS
    return max(statuses, key=lambda s: _RANK.get(s, 0))


# --------------------------------------------------------------------------- #
# Report builder — keeps every validator's output consistent.
# --------------------------------------------------------------------------- #
class Report:
    """Accumulates check results and prints a uniform summary.

    Each check is ``(label, status, detail)``. ``finish()`` prints the summary
    and returns a process exit code (0 ok / warnings, 1 hard fail).
    """

    def __init__(self, title: str, target: str, mode: str) -> None:
        self.title = title
        self.target = target
        self.mode = mode
        self.checks: list[tuple[str, str, str]] = []
        self.notes: list[str] = []

    def add(self, label: str, status: str, detail: str = "") -> None:
        self.checks.append((label, status, detail))

    def note(self, message: str) -> None:
        self.notes.append(message)

    def expect_names(self, label: str, expected: list[str], found: list[str]) -> str:
        """Tolerant name check (D-009): missing -> WARNING, present -> PASS."""
        found_set = set(found)
        missing = [n for n in expected if n not in found_set]
        extra = [n for n in found if n not in set(expected)]
        if missing:
            self.add(label, WARNING,
                     f"faltando {missing}" + (f"; extras {extra}" if extra else ""))
            return WARNING
        detail = f"{len(expected)} ok" + (f"; extras {extra}" if extra else "")
        self.add(label, PASS, detail)
        return PASS

    def verdict(self) -> str:
        return worst(*[s for _, s, _ in self.checks]) if self.checks else PASS

    def finish(self) -> int:
        print(f"== {self.title} ({self.mode}) ==")
        print(f"target: {self.target}")
        if not self.checks:
            print("  (nenhuma verificação executada)")
        for label, status, detail in self.checks:
            mark = {PASS: "ok", WARNING: " ~", FAIL: " x"}.get(status, "  ?")
            line = f"  [{mark}] {label}: {status}"
            if detail:
                line += f" — {detail}"
            print(line)
        for note in self.notes:
            print(f"  note: {note}")
        final = self.verdict()
        print(f"\n  resultado: {final}")
        return 1 if final == FAIL else 0


def no_blender_plan(title: str, cfg: dict, lines: list[str]) -> int:
    """Friendly degrade when Blender/bpy is unavailable. Returns exit code 0."""
    print(f"== {title} (sem Blender) ==")
    print("Blender (bpy) não disponível — exibindo o contrato que seria validado.")
    print("Rode dentro do Blender para validar a cena/.glb:")
    print(f"  blender --background --python {os.path.basename(sys.argv[0])}")
    print("\nContrato:")
    for line in lines:
        print(f"  {line}")
    print("\nNenhum arquivo foi modificado.")
    return 0
