import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApprovalQueue } from "@/components/approvals/ApprovalQueue";
import { requireRole } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { approvalItems, type ApprovalItem } from "@/lib/mock-data/approvals";

export const metadata: Metadata = { title: "Aprovações" };

/**
 * Aprovações: HOURS items come from the database (real queue + history) and
 * EXPENSE items remain local demo data. PROJECT_MANAGER only sees entries of
 * projects they manage; ADMIN/AREA_MANAGER see everything.
 */
export default async function AprovacoesPage() {
  // Approvals are role-protected; keep in sync with the route-permissions map.
  const user = await requireRole(["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"]);

  let items: ApprovalItem[] = approvalItems;
  const databaseConfigured = isDatabaseConfigured();

  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listHoursApprovalItems } = await import("@/lib/db/timesheet");
    const { resolveDbUser } = await import("@/lib/db/users");

    const unrestricted = hasRole(user, ["ADMIN", "AREA_MANAGER"]);
    let scope = {};
    if (!unrestricted) {
      // Dev session ids never match db rows; resolve the REAL user id for the
      // manager scope. An unresolvable manager sees an empty queue (fail closed).
      const dbUser = await resolveDbUser(user);
      scope = { managerUserId: dbUser?.id ?? "__no-manager__" };
    }

    const hoursItems = await listHoursApprovalItems(scope);
    const expenseItems = approvalItems.filter((i) => i.type === "EXPENSE");
    items = [...hoursItems, ...expenseItems];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Aprovações"
        description="Triagem de horas pendentes com aprovação, reprovação justificada e histórico de decisões."
      />
      <ApprovalQueue items={items} demoBanner={!databaseConfigured} />
    </div>
  );
}
