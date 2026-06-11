import { prisma } from "@jumpflow/database";
import { hasRole, FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import type { AppUser } from "@/lib/auth/types";
import type { LauncherBadge } from "@/lib/launcher";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";

/**
 * Real launcher badge counts from live data. Assumes a database is configured —
 * callers must guard with `isDatabaseConfigured()` first. Returns a `key → badge`
 * map mergeable into the (pure) shortcuts via `withBadges`.
 *
 * Counting is intentionally lean: COUNT queries only, never loading lists to
 * read `.length`. The pending/finance scopes mirror /app/aprovacoes and
 * /app/financeiro exactly so the badges never overstate the user's queue.
 */
export async function getLauncherBadges(
  user: AppUser,
): Promise<Record<string, LauncherBadge>> {
  const badges: Record<string, LauncherBadge> = {};

  // --- Consultant-scoped "a enviar" counters (own DRAFT work) ---------------
  const consultant = await getConsultantForUser(user);
  if (consultant) {
    const [draftHours, draftExpenses] = await Promise.all([
      prisma.timeEntry.count({
        where: { consultantId: consultant.id, status: "DRAFT" },
      }),
      prisma.expense.count({
        where: { consultantId: consultant.id, status: "DRAFT" },
      }),
    ]);
    if (draftHours > 0) {
      badges.horas = {
        count: draftHours,
        tone: "warning",
        label: "rascunhos a enviar",
      };
    }
    if (draftExpenses > 0) {
      badges.despesas = {
        count: draftExpenses,
        tone: "warning",
        label: "a enviar",
      };
    }
  }

  // --- Approval queue counter (role-scoped, mirrors /app/aprovacoes) --------
  const unrestricted = hasRole(user, ["ADMIN", "AREA_MANAGER"]);
  const isProjectManager = hasRole(user, "PROJECT_MANAGER");
  const isFinance = hasRole(user, "FINANCE");

  if (unrestricted || isProjectManager || isFinance) {
    // PROJECT_MANAGER scope needs the REAL db user id (dev session ids never
    // match db rows). An unresolvable manager scopes to nothing (fail closed).
    let managerUserId: string | undefined;
    if (!unrestricted && isProjectManager) {
      const dbUser = await resolveDbUser(user);
      managerUserId = dbUser?.id ?? "__no-manager__";
    }

    const seesHoursStage = unrestricted || isProjectManager;
    const seesManagerExpenseStage = unrestricted || isProjectManager;
    const seesFinanceExpenseStage = unrestricted || isFinance;

    const projectScope = managerUserId
      ? { project: { managerUserId } }
      : {};

    const expenseStageFilters: object[] = [];
    if (seesManagerExpenseStage) {
      expenseStageFilters.push({ status: "SUBMITTED", ...projectScope });
    }
    if (seesFinanceExpenseStage) {
      expenseStageFilters.push({ status: "MANAGER_APPROVED" });
    }

    const [hoursPending, expensesPending] = await Promise.all([
      seesHoursStage
        ? prisma.timeEntry.count({
            where: { status: "SUBMITTED", ...projectScope },
          })
        : Promise.resolve(0),
      expenseStageFilters.length
        ? prisma.expense.count({ where: { OR: expenseStageFilters } })
        : Promise.resolve(0),
    ]);

    const pending = hoursPending + expensesPending;
    if (pending > 0) {
      badges.aprovacoes = { count: pending, tone: "info", label: "aguardando" };
    }
  }

  // --- Financeiro counter (FINANCE_APPROVED expenses awaiting payment) ------
  if (hasRole(user, FINANCIAL_ROLES)) {
    const toPay = await prisma.expense.count({
      where: { status: "FINANCE_APPROVED" },
    });
    if (toPay > 0) {
      badges.financeiro = { count: toPay, tone: "info", label: "a pagar" };
    }
  }

  return badges;
}
