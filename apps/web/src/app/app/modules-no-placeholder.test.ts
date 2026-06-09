import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards the MVP outcome: no operational module page may regress to a
 * placeholder. Reading the source (instead of rendering the async server
 * components) keeps this decoupled from auth/RBAC and stable over time.
 */
const appDir = join(process.cwd(), "src/app/app");

function modulePages(): { module: string; source: string }[] {
  return readdirSync(appDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(appDir, entry.name, "page.tsx"))
    .filter((path) => {
      try {
        readFileSync(path);
        return true;
      } catch {
        return false;
      }
    })
    .map((path) => ({
      module: path,
      source: readFileSync(path, "utf8"),
    }));
}

describe("operational module pages", () => {
  const pages = modulePages();

  it("discovers every module page", () => {
    // dashboard, horas, projetos, consultores, skills, certificados,
    // aprovacoes, financeiro
    expect(pages.length).toBeGreaterThanOrEqual(8);
  });

  it.each(pages)("$module does not use ModulePlaceholder", ({ source }) => {
    expect(source).not.toContain("ModulePlaceholder");
  });

  it.each(pages)("$module does not show an \"Em breve\" badge", ({ source }) => {
    expect(source).not.toContain("Em breve");
  });
});
