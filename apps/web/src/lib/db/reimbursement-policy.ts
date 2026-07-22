import { prisma } from "@jumpflow/database";
import type { ExpenseCategory } from "@/lib/expenses/types";
import type { PolicyRuleData } from "@/lib/expenses/reimbursement-policy";

/**
 * Camada de leitura da Politica de Reembolso (Onda 3, P12/P13). Assume banco
 * configurado — o chamador deve checar isDatabaseConfigured() antes.
 */

/** Forma da regra exposta na tela de administracao. */
export interface ReimbursementPolicyRuleView {
  id: string;
  category: ExpenseCategory | null;
  maxAgeDays: number | null;
  maxAmount: number | null;
  active: boolean;
  notes: string | null;
  updatedAt: string;
}

interface RuleRow {
  id: string;
  category: string | null;
  maxAgeDays: number | null;
  maxAmount: unknown;
  active: boolean;
  notes: string | null;
  updatedAt: Date;
}

function toView(row: RuleRow): ReimbursementPolicyRuleView {
  return {
    id: row.id,
    category: (row.category as ExpenseCategory | null) ?? null,
    maxAgeDays: row.maxAgeDays,
    maxAmount: row.maxAmount === null ? null : Number(row.maxAmount),
    active: row.active,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Todas as regras cadastradas, para a tela de administracao. Ordena a regra
 * Geral (category NULL) primeiro, depois por categoria.
 */
export async function listReimbursementPolicyRules(): Promise<
  ReimbursementPolicyRuleView[]
> {
  const rows = await prisma.reimbursementPolicyRule.findMany({
    orderBy: [{ category: "asc" }],
  });
  const views = rows.map((row) => toView(row as RuleRow));
  // Geral primeiro (null antes das categorias concretas).
  return views.sort((a, b) => {
    if (a.category === null) return -1;
    if (b.category === null) return 1;
    return a.category.localeCompare(b.category);
  });
}

/**
 * Regras ATIVAS no formato do motor puro (evaluateExpensePolicy). Usado pela
 * tela de lancamento (via page) e reforcado nas server actions de despesa.
 */
export async function getActivePolicyRules(): Promise<PolicyRuleData[]> {
  const rows = await prisma.reimbursementPolicyRule.findMany({
    where: { active: true },
  });
  return rows.map((row) => {
    const r = row as RuleRow;
    return {
      category: (r.category as ExpenseCategory | null) ?? null,
      maxAgeDays: r.maxAgeDays,
      maxAmount: r.maxAmount === null ? null : Number(r.maxAmount),
      active: r.active,
    } satisfies PolicyRuleData;
  });
}
