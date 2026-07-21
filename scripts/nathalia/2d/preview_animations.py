#!/usr/bin/env python3
"""Generate a standalone, offline HTML preview of the Nathal.IA 2D animation
states.

Renders a card per animation state (idle, idle_blink, listening, talking,
thinking, success, error, alert, celebrate, wave) with lightweight CSS motion
(breathe/sway) and JS viseme-cycling for "talking" — mirroring what
`Nathalia2DAvatar` does in the app, but with zero dependencies so it opens
directly from disk (no dev server). Images are referenced relative to the file
under `assets/2d/layers/`, and the state→expression mapping mirrors
`nathaliaAnimationRegistry.ts` + `nathaliaExpressions.ts`.

Output: `assets/2d/animations/preview.html`.

Usage:
    python scripts/nathalia/2d/preview_animations.py

Exit codes: 0 = ok, 1 = catalog missing.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
ASSETS_2D = os.path.join(REPO_ROOT, "packages", "character-nathalia", "assets", "2d")
CATALOG_JSON = os.path.join(ASSETS_2D, "catalog.json")
OUT_HTML = os.path.join(ASSETS_2D, "animations", "preview.html")

# Mirrors nathaliaAnimationRegistry + nathaliaExpressions (representative face per state).
STATE_EXPRESSION = {
    "idle": "animada",
    "idle_blink": "animada",
    "listening": "curiosa",
    "talking": "animada",
    "thinking": "pensativa",
    "success": "empolgada",
    "error": "encorajando",
    "alert": "alerta",
    "celebrate": "comemorando",
    "wave": "animada",
}
# Motion profile per state -> CSS animation name.
STATE_MOTION = {
    "idle": "calm", "idle_blink": "calm", "listening": "attentive",
    "talking": "talk", "thinking": "calm", "success": "emphatic",
    "error": "attentive", "alert": "attentive", "celebrate": "emphatic", "wave": "emphatic",
}
VISEME_SEQUENCE = ["rest", "a", "e", "o", "m", "i", "u", "s", "a", "o", "e", "rest", "tdn", "a", "rest"]


def main(argv: list[str]) -> int:
    if not os.path.exists(CATALOG_JSON):
        sys.stderr.write("catalog.json not found — run catalog_assets.py first\n")
        return 1
    with open(CATALOG_JSON, encoding="utf-8") as fh:
        catalog = json.load(fh)

    have_expr = {a["subCategory"] for a in catalog["assets"] if a["category"] == "expression"}
    have_vis = {a["subCategory"] for a in catalog["assets"] if a["category"] == "viseme"}

    def expr_url(name: str) -> str:
        name = name if name in have_expr else "confiante"
        return f"../layers/face/expressions/{name}.webp"

    vis_urls = [f"../layers/face/visemes/vis-{v}.webp" for v in VISEME_SEQUENCE if v in have_vis]

    cards = []
    for state, expr in STATE_EXPRESSION.items():
        motion = STATE_MOTION.get(state, "calm")
        talking = "true" if state == "talking" else "false"
        cards.append(
            f'<figure class="card"><div class="stage">'
            f'<img class="face m-{motion}" data-talking="{talking}" '
            f'src="{expr_url(expr)}" alt="{state}"></div>'
            f'<figcaption>{state}<small>{expr}</small></figcaption></figure>'
        )

    html = f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nathal.IA — preview de animações 2D</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: system-ui, sans-serif; margin: 0; padding: 24px; background:#faf7f2; color:#1a1a1a; }}
  h1 {{ font-size: 20px; }}
  p.note {{ color:#555; max-width: 60ch; }}
  .grid {{ display:grid; grid-template-columns: repeat(auto-fill, minmax(150px,1fr)); gap:16px; margin-top:16px; }}
  .card {{ margin:0; border:2px solid #1a1a1a; border-radius:14px; background:#fff; padding:12px; box-shadow:4px 4px 0 0 #1a1a1a; }}
  .stage {{ display:grid; place-items:center; height:140px; }}
  .face {{ width:128px; height:128px; object-fit:cover; border-radius:50%; transform-origin:50% 80%; }}
  figcaption {{ text-align:center; font-weight:700; margin-top:8px; }}
  figcaption small {{ display:block; font-weight:500; color:#777; }}
  .toolbar {{ margin-top:12px; }}
  button {{ border:2px solid #1a1a1a; background:#ffd34d; border-radius:10px; padding:6px 12px; font-weight:700; cursor:pointer; }}
  .dark body, body.dark {{ background:#1a1a1a; color:#faf7f2; }}
  @keyframes calm {{ 0%,100%{{transform:translateY(0) rotate(-1.1deg);}} 50%{{transform:translateY(-3px) rotate(1.1deg);}} }}
  @keyframes talk {{ 0%,100%{{transform:translateY(0) rotate(-0.25deg);}} 50%{{transform:translateY(-2px) rotate(0.25deg);}} }}
  @keyframes attentive {{ 0%,100%{{transform:translateY(0) rotate(-2deg);}} 50%{{transform:translateY(-4px) rotate(2deg);}} }}
  @keyframes emphatic {{ 0%,100%{{transform:translateY(0) rotate(-3deg) scale(1);}} 50%{{transform:translateY(-7px) rotate(3deg) scale(1.04);}} }}
  .m-calm {{ animation: calm 6s ease-in-out infinite; }}
  .m-talk {{ animation: talk 1.4s ease-in-out infinite; }}
  .m-attentive {{ animation: attentive 2.2s ease-in-out infinite; }}
  .m-emphatic {{ animation: emphatic 1.1s ease-in-out infinite; }}
  @media (prefers-reduced-motion: reduce) {{ .face {{ animation: none !important; }} }}
</style></head>
<body>
  <h1>Nathal.IA — preview de animações 2D ({len(cards)} estados)</h1>
  <p class="note">Gerado por <code>scripts/nathalia/2d/preview_animations.py</code>.
  Offline: abra direto no navegador. Reproduz o motion do <code>Nathalia2DAvatar</code>
  (breathe/sway por perfil) e o lip-sync do estado <b>talking</b> (troca de visema).</p>
  <div class="toolbar"><button onclick="document.body.classList.toggle('dark')">alternar fundo</button></div>
  <div class="grid">{''.join(cards)}</div>
  <script>
    const visemes = {json.dumps(vis_urls)};
    const talkers = [...document.querySelectorAll('.face[data-talking="true"]')];
    if (visemes.length && talkers.length) {{
      let i = 0;
      setInterval(() => {{
        i = (i + 1) % visemes.length;
        talkers.forEach(img => {{ img.src = visemes[i]; }});
      }}, 135);
    }}
  </script>
</body></html>
"""

    os.makedirs(os.path.dirname(OUT_HTML), exist_ok=True)
    with open(OUT_HTML, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(html)
    sys.stderr.write(
        f"preview: {len(cards)} state(s) -> "
        + os.path.relpath(OUT_HTML, REPO_ROOT).replace(os.sep, "/")
        + "\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
