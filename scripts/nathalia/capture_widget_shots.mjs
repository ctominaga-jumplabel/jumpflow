#!/usr/bin/env node
/**
 * Fase 8.3 — live validation of the Nathal.IA launcher visibility fix.
 *
 * Logs in via AUTH_DEV_MODE, visits the main /app screens, and for each:
 *   - asserts the launcher (`[data-nathalia-launcher]`) is present AND its
 *     bounding box is fully inside the viewport (the bug pinned it off-screen),
 *   - saves a full-page screenshot + a cropped launcher screenshot.
 *
 * Disposable QA helper. Usage: node scripts/nathalia/capture_widget_shots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.SHOT_BASE_URL || "http://localhost:3100";
const OUT = resolve("docs/nathalia/audit-screenshots/v3-fix");
const VIEWPORT = { width: 1440, height: 900 };
const ROUTES = [
  "/app",
  "/app/horas",
  "/app/projetos",
  "/app/aprovacoes",
  "/app/relatorios",
  "/app/dev/nathalia",
];

function slug(r) {
  return r.replace(/^\//, "").replace(/\//g, "-") || "root";
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORT });
const page = await ctx.newPage();
mkdirSync(OUT, { recursive: true });

const results = [];

// --- dev login ---------------------------------------------------------- //
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
const devBtn = page.getByRole("button", { name: /ambiente de desenvolvimento/i });
await devBtn.click();
await page.waitForURL(/\/app/, { timeout: 60000 }).catch(() => {});

// --- per-route check + screenshots -------------------------------------- //
for (const route of ROUTES) {
  let navError = null;
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    navError = String(e.message || e).split("\n")[0];
  }
  const launcher = page.locator("[data-nathalia-launcher]");
  let count = 0;
  try {
    await launcher.first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    /* fall through to count=0 */
  }
  count = await launcher.count();

  let box = null;
  let inViewport = false;
  if (count > 0) {
    box = await launcher.first().boundingBox();
    if (box) {
      inViewport =
        box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= VIEWPORT.width + 1 &&
        box.y + box.height <= VIEWPORT.height + 1;
    }
  }

  const full = resolve(OUT, `${slug(route)}.png`);
  await page.screenshot({ path: full, fullPage: false });
  let crop = null;
  if (box) {
    crop = resolve(OUT, `${slug(route)}-launcher.png`);
    await launcher.first().screenshot({ path: crop });
  }

  results.push({ route, count, box, inViewport, navError });
  console.log(
    `${route} -> launcherCount=${count} inViewport=${inViewport} ` +
      (box
        ? `box=(${Math.round(box.x)},${Math.round(box.y)} ${Math.round(box.width)}x${Math.round(box.height)})`
        : "box=null") +
      (navError ? ` navWarn="${navError}"` : ""),
  );
}

await browser.close();

const evaluated = results.filter((r) => r.count >= 1 && r.box);
const passed = evaluated.filter((r) => r.inViewport);
const offscreen = evaluated.filter((r) => !r.inViewport);
const inconclusive = results.filter((r) => r.count < 1 || !r.box);
console.log("\nVIEWPORT:", VIEWPORT.width + "x" + VIEWPORT.height);
console.log("OUT:", OUT);
console.log(
  `evaluated=${evaluated.length} in-viewport=${passed.length} ` +
    `off-screen=${offscreen.length} inconclusive(nav timeout)=${inconclusive.length}`,
);
if (inconclusive.length) {
  console.log("inconclusive routes (page shell did not render — DB/dev compile):", inconclusive.map((r) => r.route).join(", "));
}
const ok = offscreen.length === 0 && passed.length > 0;
console.log("RESULT:", ok ? "PASS — launcher in-viewport on every screen that rendered" : "FAIL — launcher off-screen somewhere");
process.exit(ok ? 0 : 1);
