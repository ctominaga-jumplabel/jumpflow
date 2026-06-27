#!/usr/bin/env node
/**
 * Sync the Nathal.IA runtime GLBs into the web app's public folder.
 *
 * Sources (packages/character-nathalia/assets/models):
 *   - master_v3_preview.glb  — Fase 8.3 V3-aligned character (runtime default)
 *   - master_v2_preview.glb  — Fase 7 refined character (kept as a fallback)
 *   - master_preview.glb     — Fase 5 V1 (kept as a fallback)
 *   - accessories/*.glb       — Fase 7 official accessory props
 *
 * Copied to apps/web/public/nathalia/ so Next.js serves them at
 * /nathalia/<file> and /nathalia/accessories/<file>.
 *
 * All sources are gitignored (*.glb), so this must run wherever the 3D avatar
 * should be available (local dev, or a build step when 3D is enabled in prod).
 *
 * Usage (from repo root):  node scripts/nathalia/sync_runtime_model.mjs
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

const FILES = [
  "master_v3_preview.glb",
  "master_v2_preview.glb",
  "master_preview.glb",
];
const srcDir = resolve(repoRoot, "packages/character-nathalia/assets/models");
const dstDir = resolve(repoRoot, "apps/web/public/nathalia");

mkdirSync(dstDir, { recursive: true });

let copied = 0;
let missing = 0;
for (const file of FILES) {
  const src = resolve(srcDir, file);
  const dst = resolve(dstDir, file);
  if (!existsSync(src)) {
    console.warn(`! skip ${file}: not found at ${src}`);
    missing += 1;
    continue;
  }
  copyFileSync(src, dst);
  console.log(`✓ ${file} -> ${dst}`);
  copied += 1;
}

// Accessory props (each its own GLB, loaded on demand at runtime).
const accSrcDir = resolve(srcDir, "accessories");
const accDstDir = resolve(dstDir, "accessories");
if (existsSync(accSrcDir)) {
  mkdirSync(accDstDir, { recursive: true });
  for (const file of readdirSync(accSrcDir)) {
    if (!file.endsWith(".glb")) continue;
    copyFileSync(resolve(accSrcDir, file), resolve(accDstDir, file));
    console.log(`✓ accessories/${file}`);
    copied += 1;
  }
}

console.log(`\nDone. ${copied} copied, ${missing} missing.`);
if (missing > 0 && copied === 0) {
  console.warn(
    "No runtime model available. The 3D avatar will fall back to 2D/CSS.",
  );
}
