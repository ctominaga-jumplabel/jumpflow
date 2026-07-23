import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  ApprovalQueue,
  type ApprovalQueueInitialFilters,
} from "@/components/approvals/ApprovalQueue";
import { requireRole } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { approvalItems, type ApprovalItem } from "@/lib/mock-data/approvals";

export const metadata: Metadata = { title: "Aprovações" };

interface AprovacoesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.length > 0 ? v : undefined;
}

/**
 * Read the optional deep-link filters from the query string. Used by the
 * operational closing to land on a specific consultant + project + status.
 * Authorization is unchanged: the data is still scoped server-side per role;
 * these are purely client-side display filters over data the user may already
 * see, so a hand-crafted query never widens visibility.
 */
function readInitialFilters(
  params: Record<string, string | string[] | undefined>,
): ApprovalQueueInitialFilters | undefined {
  const filters: ApprovalQueueInitialFilters = {
    kind: firstParam(params.kind) as ApprovalQueueInitialFilters["kind"],
    status: firstParam(params.status) as ApprovalQueueInitialFilters["status"],
    client: firstParam(params.client),
    project: firstParam(params.project),
    consultant: firstParam(params.consultant),
    activity: firstParam(params.activity),
    startDate: firstParam(params.from),
    endDate: firstParam(params.to),
  };
  const hasAny = Object.values(filters).some((value) => Boolean(value));
  return hasAny ? filters : undefined;
}

/**
 * Aprovações: with a database the queue is fully real — HOURS items decided
 * via decideHours and EXPENSE items via decideAsManager/decideAsFinance, with
 * a visible stage label. Scope per role: PROJECT_MANAGER sees only its
 * projects (manager stage); FINANCE sees only the finance stage of expenses;
 * ADMIN/AREA_MANAGER see everything. Without a database, the original mock
 * queue keeps the screen usable (explicit banner).
 */
export default async function AprovacoesPage({
  searchParams,
}: AprovacoesPageProps) {
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
  const initialFilters = readInitialFilters(await searchParams);
  // "Faturável" virou definição de gestão, flagável por dia na aprovação. Só
  // papéis de gestão/financeiro (BILLABLE_MANAGER_ROLES) editam — o mesmo
  // conjunto que alcança esta tela; o servidor (setEntryBillable) reautoriza.
  const canEditBillable = hasRole(user, [
    "ADMIN",
    "AREA_MANAGER",
    "PROJECT_MANAGER",
    "FINANCE",
  ]);
  let billableAttachmentsAvailable = false;

  if (databaseConfigured) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { listHoursApprovalItems } = await import("@/lib/db/timesheet");
    const { listExpenseApprovalItems } = await import("@/lib/db/expenses");
    const { resolveDbUser } = await import("@/lib/db/users");
    const { getReportFilterOptions } = await import("@/lib/db/reports");
    const { isStorageConfigured } = await import("@/lib/storage/provider");
    billableAttachmentsAvailable = isStorageConfigured();

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
        initialFilters={initialFilters}
        reportFilterOptions={reportFilterOptions}
        canEditBillable={canEditBillable}
        billableAttachmentsAvailable={billableAttachmentsAvailable}
      />
    </div>
  );
}
