import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApprovalQueue } from "@/components/approvals/ApprovalQueue";
import { requireRole } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { approvalItems, type ApprovalItem } from "@/lib/mock-data/approvals";

export const metadata: Metadata = { title: "Aprovações" };

/**
 * Aprovações: with a database the queue is fully real — HOURS items decided
 * via decideHours and EXPENSE items via decideAsManager/decideAsFinance, with
 * a visible stage label. Scope per role: PROJECT_MANAGER sees only its
 * projects (manager stage); FINANCE sees only the finance stage of expenses;
 * ADMIN/AREA_MANAGER see everything. Without a database, the original mock
 * queue keeps the screen usable (explicit banner).
 */
export default async function AprovacoesPage() {
  // Keep in sync with the route-permissions map (/app/aprovacoes).
  const user = await requireRole([
    "ADMIN",
    "AREA_MANAGER",
    "PROJECT_MANAGER",
    "FINANCE",
  ]);

  let items: ApprovalItem[] = approvalItems;
  let reportFilterOptions:
    | {
        clients: { id: string; name: string }[];
        consultants: { id: string; name: string }[];
      }
    | undefined;
  const databaseConfigured = isDatabaseConfigured();

  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listHoursApprovalItems } = await import("@/lib/db/timesheet");
    const { listExpenseApprovalItems } = await import("@/lib/db/expenses");
    const { resolveDbUser } = await import("@/lib/db/users");
    const { getReportFilterOptions } = await import("@/lib/db/reports");

    const unrestricted = hasRole(user, ["ADMIN", "AREA_MANAGER"]);
    const isProjectManager = hasRole(user, "PROJECT_MANAGER");
    const isFinance = hasRole(user, "FINANCE");

    let managerUserId: string | undefined;
    if (!unrestricted && isProjectManager) {
      // Dev session ids never match db rows; resolve the REAL user id for the
      // manager scope. An unresolvable manager sees an empty stage (fail closed).
      const dbUser = await resolveDbUser(user);
      managerUserId = dbUser?.id ?? "__no-manager__";
    }

    // FINANCE without a manager role never sees the hours queue (it cannot
    // decide hours); the expense scope mirrors section 7 of the spec.
    const seesHours = unrestricted || isProjectManager;
    const hoursItems = seesHours
      ? await listHoursApprovalItems(managerUserId ? { managerUserId } : {})
      : [];
    const expenseItems = await listExpenseApprovalItems({
      includeManagerStage: unrestricted || isProjectManager,
      includeFinanceStage: unrestricted || isFinance,
      managerUserId,
    });

    // Real data only: mock items never mix into a db-backed queue, so the
    // counters always reflect actual pending work.
    items = [...hoursItems, ...expenseItems];

    // Scoped name → id options so the queue can build the CSV export link to
    // the shared Relatorios endpoint (same RBAC the read above already uses).
    const options = await getReportFilterOptions(user);
    reportFilterOptions = {
      clients: options.clients,
      consultants: options.consultants,
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Aprovações"
        description="Triagem de horas e despesas pendentes com aprovação, reprovação justificada e histórico de decisões."
      />
      <ApprovalQueue
        items={items}
        demoBanner={!databaseConfigured}
        reportFilterOptions={reportFilterOptions}
      />
    </div>
  );
}
