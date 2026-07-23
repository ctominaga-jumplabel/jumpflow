import { prisma } from "@jumpflow/database";
import type { ExpenseTypeOption } from "@/lib/expenses/types";

/**
 * Camada de leitura/escrita do registro de Tipos de Despesa (ExpenseType,
 * item 12). Substitui o antigo enum ExpenseCategory por uma lista gerenciável
 * na tela Política de Reembolso. Assume banco configurado — o chamador deve
 * checar isDatabaseConfigured() antes.
 */

/** Forma administrativa (tabela de gestão): inclui id, system e ordem. */
export interface ExpenseTypeAdminView {
  id: string;
  code: string;
  label: string;
  active: boolean;
  /** true = tipo nativo (não pode ser removido; pode ser renomeado/desativado). */
  system: boolean;
  sortOrder: number;
}

/** Todos os tipos (ativos e inativos), ordenados para a tela de gestão. */
export async function listExpenseTypes(): Promise<ExpenseTypeAdminView[]> {
  const rows = await prisma.expenseType.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      code: true,
      label: true,
      active: true,
      system: true,
      sortOrder: true,
    },
  });
  return rows;
}

/**
 * Opções {code,label,active} de todos os tipos, para dropdowns (o chamador
 * filtra ativos) e para montar o mapa de rótulos ao renderizar despesas.
 */
export async function listExpenseTypeOptions(): Promise<ExpenseTypeOption[]> {
  const rows = await prisma.expenseType.findMany({
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: { code: true, label: true, active: true },
  });
  return rows;
}

/** Conjunto de códigos ATIVOS — usado para validar categoria no servidor. */
export async function getActiveExpenseTypeCodes(): Promise<Set<string>> {
  const rows = await prisma.expenseType.findMany({
    where: { active: true },
    select: { code: true },
  });
  return new Set(rows.map((r) => r.code));
}

/** Um tipo pelo código (para validação/edição). null quando não existe. */
export async function getExpenseTypeByCode(
  code: string,
): Promise<ExpenseTypeAdminView | null> {
  return prisma.expenseType.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      label: true,
      active: true,
      system: true,
      sortOrder: true,
    },
  });
}
