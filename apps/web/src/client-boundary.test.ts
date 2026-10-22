import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Regression guard (Matriz de Permissões, digest 1278151909): a SERVER module
 * that imports a VALUE (constant, array, function) from a "use client" module
 * receives a client reference, not the value — `.includes`/`.map` crash only in
 * production, never in vitest. Server files may import components (PascalCase)
 * and types from client modules; anything else must live in a plain module.
 */
const SRC = join(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const isClient = (path: string) =>
  /^\s*["']use client["']/.test(readFileSync(path, "utf8").slice(0, 200));

function resolveAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = join(SRC, spec.slice(2));
  for (const ext of [".tsx", ".ts", "/index.tsx", "/index.ts"]) {
    if (existsSync(base + ext)) return base + ext;
  }
  return null;
}

describe("server ↔ client module boundary", () => {
  it("no server module imports a non-component value from a 'use client' module", () => {
    const offenders: string[] = [];
    const files = walk(SRC).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) && !isClient(f),
    );
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const m of source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)) {
        if (m[1]) continue;
        const target = resolveAlias(m[3]);
        if (!target || !isClient(target)) continue;
        const values = m[2]
          .split(",")
          .map((n) => n.trim())
          .filter((n) => n && !n.startsWith("type "))
          .map((n) => n.split(/\s+as\s+/)[0])
          .filter((n) => !/^[A-Z][a-z]/.test(n));
        if (values.length > 0) {
          offenders.push(`${file.replace(SRC, "src")} ← ${m[3]}: ${values.join(", ")}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
