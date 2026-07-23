import {
  expenseCategoryLabel,
  expenseCategoryLabels,
  type ExpenseCategory,
} from "./types";

/**
 * Motor PURO da Politica de Reembolso (Onda 3, P13).
 *
 * Dado o tipo, a data e o valor de um lancamento + as regras aplicaveis
 * (a regra Geral e a regra da categoria), retorna as violacoes de politica:
 * PRAZO (data mais antiga que hoje - maxAgeDays) e VALOR (valor acima do teto).
 *
 * Sem imports de servidor/Prisma: seguro para importar do cliente (alerta
 * bloqueante no formulario) e do servidor (reforco em createExpense/
 * createExpenseBatch/submitExpense), garantindo mensagens identicas nos dois
 * lados. A checagem que vale e sempre a do servidor.
 */

/** Regra de politica desacoplada do Prisma (numbers, nao Decimal). */
export interface PolicyRuleData {
  /** NULL = regra Geral (vale para todas as categorias). */
  category: ExpenseCategory | null;
  /** Prazo maximo em dias para lancar (contado da data da despesa). */
  maxAgeDays: number | null;
  /** Teto do valor do lancamento (BRL). */
  maxAmount: number | null;
  active: boolean;
}

export type PolicyViolationKind = "PRAZO" | "VALOR";

export interface PolicyViolation {
  kind: PolicyViolationKind;
  message: string;
}

export interface ExpenseForPolicy {
  category?: ExpenseCategory | null;
  /** Data da despesa (yyyy-mm-dd). */
  date: string;
  /** Valor do lancamento (BRL). */
  amount: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse yyyy-mm-dd em UTC midnight; null quando invalido. */
function parseDay(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const time = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const date = new Date(time);
  // Rejeita datas normalizadas (ex.: 2026-02-31).
  if (
    date.getUTCFullYear() !== Number(y) ||
    date.getUTCMonth() !== Number(m) - 1 ||
    date.getUTCDate() !== Number(d)
  ) {
    return null;
  }
  return time;
}

const brl = (value: number) =>
  value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

/**
 * Seleciona as regras que se aplicam a um lancamento: a regra Geral (category
 * NULL) e a regra da propria categoria, ambas apenas quando `active`.
 */
export function applicableRules(
  rules: readonly PolicyRuleData[],
  category: ExpenseCategory | null | undefined,
): PolicyRuleData[] {
  return rules.filter(
    (rule) =>
      rule.active &&
      (rule.category === null ||
        (category != null && rule.category === category)),
  );
}

/**
 * Avalia um lancamento contra as regras de politica. Retorna todas as
 * violacoes encontradas (pode haver PRAZO e VALOR ao mesmo tempo, e ate uma
 * de cada por regra Geral/categoria — deduplicadas por tipo/mensagem).
 */
export function evaluateExpensePolicy(
  expense: ExpenseForPolicy,
  rules: readonly PolicyRuleData[],
  todayIso: string,
  /** Rótulos do registro de tipos (banco); default = rótulos nativos. */
  categoryLabels: Record<string, string> = expenseCategoryLabels,
): PolicyViolation[] {
  const applicable = applicableRules(rules, expense.category);
  if (applicable.length === 0) return [];

  const expenseDay = parseDay(expense.date);
  const today = parseDay(todayIso);
  const categoryLabel = expenseCategoryLabel(
    expense.category ?? null,
    categoryLabels,
  );

  const violations: PolicyViolation[] = [];
  const seen = new Set<string>();
  const push = (kind: PolicyViolationKind, message: string) => {
    const key = `${kind}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    violations.push({ kind, message });
  };

  for (const rule of applicable) {
    if (
      rule.maxAgeDays != null &&
      expenseDay !== null &&
      today !== null
    ) {
      const ageDays = Math.floor((today - expenseDay) / DAY_MS);
      if (ageDays > rule.maxAgeDays) {
        push(
          "PRAZO",
          `Prazo de ${rule.maxAgeDays} dias para lancar excedido (${categoryLabel}): a despesa e de ${ageDays} dias atras.`,
        );
      }
    }
    if (rule.maxAmount != null && expense.amount > rule.maxAmount) {
      push(
        "VALOR",
        `Lancamento acima do teto de ${brl(rule.maxAmount)} para ${categoryLabel}.`,
      );
    }
  }

  return violations;
}
