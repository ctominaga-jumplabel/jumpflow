import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import { financeExpensesXlsxColumns } from "@/lib/financial/financeiro-export";
import { noDatabaseResponse } from "../../../relatorios/shared";

export const dynamic = "force-dynamic";

/**
 * `.xlsx` export of "Contas a Pagar" (Onda 6): finance-approved expenses awaiting
 * payment. Re-checks FINANCIAL_ROLES (same gate as /app/financeiro) and reuses
 * `listFinanceExpenses`, the SAME read that feeds the tab (FINANCE_APPROVED /
 * PAYMENT_SCHEDULED / PAID). The tab has no period filter of its own, so the
 * export mirrors it and covers the full finance queue. Audits
 * `FINANCE_EXPENSES_EXPORTED`.
 */
export async function GET() {
  const user = await requireRole(FINANCIAL_ROLES);
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const { listFinanceExpenses } = await import("@/lib/db/expenses");
  const { expenses } = await listFinanceExpenses();

  const daySlug = new Date().toISOString().slice(0, 10);
  const buffer = await buildWorkbook([
    defineSheet({
      name: "Contas a Pagar",
      columns: financeExpensesXlsxColumns(),
      rows: expenses,
    }),
  ]);

  const { resolveDbUser } = await import("@/lib/db/users");
  const { recordAuditEvent } = await import("@/lib/db/audit");
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "Expense",
    entityId: daySlug,
    action: "FINANCE_EXPENSES_EXPORTED",
    after: { rowCount: expenses.length },
  });

  return xlsxResponse(buffer, `contas-a-pagar_${daySlug}.xlsx`);
}
