import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// Plain ESM data module; `main()` only runs when the script is invoked directly.
import { PERMISSION_CATALOG_ALIGNMENT } from "../../../../../packages/database/prisma/align-permission-catalog.mjs";
import { SYSTEM_PERMISSION_CODES } from "./permission-codes";

/**
 * The alignment script (for databases already in use) must apply EXACTLY the
 * names/modules/hierarchy the seed gives new databases, for every native code.
 */
describe("align-permission-catalog.mjs", () => {
  const seed = readFileSync(
    join(process.cwd(), "../../packages/database/prisma/seed.mjs"),
    "utf8",
  );
  const block = seed.slice(
    seed.indexOf("const PERMISSION_CATALOG = ["),
    seed.indexOf("async function seedPermissions"),
  );
  const seeded = [
    ...block.matchAll(
      /code: "([A-Z0-9_]+)", name: "([^"]*)", module: "([^"]*)"(?:, parent: "([A-Z0-9_]+)")?, sort: (\d+)/g,
    ),
  ].map((m) => ({
    code: m[1],
    name: m[2],
    module: m[3],
    parent: m[4] ?? null,
    sortOrder: Number(m[5]),
  }));

  it("mirrors the seed catalog entry by entry", () => {
    expect(seeded.length).toBe(SYSTEM_PERMISSION_CODES.size);
    expect(PERMISSION_CATALOG_ALIGNMENT).toEqual(seeded);
  });

  it("only references parents that are top-level native screens in the same module", () => {
    const byCode = new Map(PERMISSION_CATALOG_ALIGNMENT.map((p) => [p.code, p]));
    for (const p of PERMISSION_CATALOG_ALIGNMENT) {
      if (!p.parent) continue;
      const parent = byCode.get(p.parent);
      expect(parent, p.code).toBeDefined();
      expect(parent!.parent, p.code).toBeNull();
      expect(parent!.module, p.code).toBe(p.module);
    }
  });
});
