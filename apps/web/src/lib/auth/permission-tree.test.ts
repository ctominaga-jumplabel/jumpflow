import { describe, expect, it } from "vitest";
import {
  groupPermissionTree,
  suggestPermissionCode,
  suggestRoleKey,
} from "./permission-tree";

const node = (id: string, module: string, sortOrder: number, parentId: string | null = null) => ({
  id,
  module,
  sortOrder,
  parentId,
  name: id,
});

describe("groupPermissionTree", () => {
  it("orders modules by menu order and puts subtelas right after their screen", () => {
    const tree = groupPermissionTree([
      node("financeiro", "Financeiro", 110),
      node("lote", "Horas", 0, "horas"), // admin-created child with order 0
      node("horas", "Horas", 10),
      node("lancamentos", "Horas", 11, "horas"),
      node("dashboard", "Relatórios & Análises", 0),
    ]);
    expect(tree.map(([m]) => m)).toEqual(["Relatórios & Análises", "Horas", "Financeiro"]);
    expect(tree[1][1].map((n) => n.id)).toEqual(["horas", "lote", "lancamentos"]);
  });

  it("keeps a subtela whose parent was filtered out (search)", () => {
    const tree = groupPermissionTree([node("lancamentos", "Horas", 11, "horas")]);
    expect(tree).toEqual([["Horas", [expect.objectContaining({ id: "lancamentos" })]]]);
  });
});

describe("code suggestions", () => {
  it("builds an UPPER_SNAKE code prefixed by the parent, without accents", () => {
    expect(suggestPermissionCode("Lançamentos em lote", "HORAS")).toBe("HORAS_LANCAMENTOS_EM_LOTE");
    expect(suggestPermissionCode("Relatórios")).toBe("RELATORIOS");
    expect(suggestPermissionCode("1-on-1")).toBe("F_1_ON_1");
  });

  it("builds a kebab group key", () => {
    expect(suggestRoleKey("Auditoria Interna")).toBe("auditoria-interna");
    expect(suggestRoleKey("")).toBe("");
  });
});
