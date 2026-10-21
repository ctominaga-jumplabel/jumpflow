/**
 * Pure ordering helpers for the permission catalog (no I/O), shared by the
 * Permission Matrix and the Funcionalidades CRUD so both read the catalog the
 * same way the app is navigated: módulo → tela → subtelas/funcionalidades.
 */

export interface PermissionTreeNode {
  id: string;
  parentId: string | null;
  module: string;
  name: string;
  sortOrder: number;
}

const byOrder = (a: PermissionTreeNode, b: PermissionTreeNode) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR");

/**
 * Group the catalog by module and order it as a two-level tree: each top-level
 * screen is followed by its children. Modules follow the lowest `sortOrder` of
 * their top-level screens (the seed numbers them in menu order), so the matrix
 * mirrors the sidebar instead of the alphabet. A child whose parent is missing
 * or lives in another module is treated as top-level — it is never dropped.
 */
export function groupPermissionTree<T extends PermissionTreeNode>(
  items: readonly T[],
): Array<[string, T[]]> {
  const ids = new Map(items.map((i) => [i.id, i] as const));
  const isRoot = (i: T) => {
    if (!i.parentId) return true;
    const parent = ids.get(i.parentId);
    return !parent || parent.module !== i.module;
  };

  const childrenOf = new Map<string, T[]>();
  const rootsByModule = new Map<string, T[]>();
  for (const item of items) {
    if (isRoot(item)) {
      if (!rootsByModule.has(item.module)) rootsByModule.set(item.module, []);
      rootsByModule.get(item.module)!.push(item);
    } else {
      if (!childrenOf.has(item.parentId!)) childrenOf.set(item.parentId!, []);
      childrenOf.get(item.parentId!)!.push(item);
    }
  }

  // A module whose items are all children of a filtered-out parent still needs
  // a bucket (e.g. a search that matches only subtelas).
  for (const item of items) {
    if (!rootsByModule.has(item.module)) rootsByModule.set(item.module, []);
  }

  const modules = [...rootsByModule.entries()].map(([module, roots]) => {
    roots.sort(byOrder);
    const ordered: T[] = [];
    for (const root of roots) {
      ordered.push(root);
      ordered.push(...(childrenOf.get(root.id) ?? []).sort(byOrder));
    }
    // Children whose parent is not in `items` (filtered) but shares the module.
    const placed = new Set(ordered.map((i) => i.id));
    const leftovers = items
      .filter((i) => i.module === module && !placed.has(i.id))
      .sort(byOrder);
    ordered.push(...leftovers);
    // Rank by top-level screens only: a subtela's own order must not move the
    // whole module (admin-created children often keep sortOrder 0).
    const ranked = roots.length > 0 ? roots : ordered;
    const rank = ranked.length > 0 ? Math.min(...ranked.map((i) => i.sortOrder)) : 0;
    return { module, ordered, rank };
  });

  modules.sort((a, b) => a.rank - b.rank || a.module.localeCompare(b.module, "pt-BR"));
  return modules
    .filter((m) => m.ordered.length > 0)
    .map((m) => [m.module, m.ordered]);
}

/**
 * Suggest a stable UPPER_SNAKE_CASE code from a display name, prefixed by the
 * parent's code for subtelas (e.g. HORAS + "Lançamentos em lote" →
 * HORAS_LANCAMENTOS_EM_LOTE). Accents are stripped.
 */
export function suggestPermissionCode(name: string, parentCode?: string | null): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!slug) return parentCode ?? "";
  const base = parentCode ? `${parentCode}_${slug}` : slug;
  // Codes must start with a letter (CODE_RE in lib/db/permissions.ts).
  return /^[A-Z]/.test(base) ? base : `F_${base}`;
}

/** Suggest a lowercase-kebab group identifier from its name. */
export function suggestRoleKey(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(slug) ? slug : slug ? `g-${slug}` : "";
}
