import type { Metadata } from "next";
import { UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReportsView } from "@/components/reports/ReportsView";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { hasRole } from "@/lib/auth/route-permissions";
import {
  consolidatedReportFilterSchema,
  expensesReportFilterSchema,
  hoursReportFilterSchema,
} from "@/lib/reports/schemas";

export const metadata: Metadata = { title: "Relatórios" };

type RawParams = Record<string, string | string[] | undefined>;

interface RelatoriosPageProps {
  searchParams: Promise<RawParams>;
}

const TABS = ["horas", "despesas", "consolidado"] as const;
type Tab = (typeof TABS)[number];

function resolveTab(value: string | string[] | undefined): Tab {
  const raw = Array.isArray(value) ? value[0] : value;
  return TABS.includes(raw as Tab) ? (raw as Tab) : "horas";
}

/** Flatten searchParams (first value wins) for Zod parsing. */
function flatten(params: RawParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? (value[0] ?? "") : value;
  }
  return out;
}

/**
 * Relatorios: filterable, exportable reports of Horas, Despesas and a
 * Consolidado/closing view. Scope and financial-field masking are decided on
 * the server (`lib/db/reports.ts`) per the real user — the screen and the CSV
 * share the same read functions. Without a database the screen shows an honest
 * demonstration banner and empty tables.
 */
export default async function RelatoriosPage({
  searchParams,
}: RelatoriosPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = resolveTab(params.tab);
  const flat = flatten(params);
  const includeFinancials = hasRole(user, ["ADMIN", "AREA_MANAGER", "FINANCE"]);

  const header = (
    <PageHeader
      eyebrow="Gestão"
      title="Relatórios"
      description="Relatórios filtráveis de horas, despesas e um consolidado de fechamento, com exportação em CSV."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <ReportsView
          mode="demo"
          tab={tab}
          includeFinancials={includeFinancials}
          filterOptions={{ clients: [], projects: [], consultants: [] }}
          rawParams={flat}
        />
      </div>
    );
  }

  const { resolveReportScope, getReportFilterOptions } = await import(
    "@/lib/db/reports"
  );
  const scope = await resolveReportScope(user);

  // A consultant with no linked Consultant and no management role has no data.
  const isConsultantOnly =
    !scope.broad && !scope.managerUserId && !scope.ownConsultantId;
  if (isConsultantOnly) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={UserX}
          title="Sem vínculo de consultor"
          description="Seu usuário não está vinculado a um consultor. Contate um administrador."
        />
      </div>
    );
  }

  const filterOptions = await getReportFilterOptions(user);

  let hoursReport;
  let expensesReport;
  let consolidatedReport;

  if (tab === "horas") {
    const parsed = hoursReportFilterSchema.safeParse(flat);
    const { getHoursReport } = await import("@/lib/db/reports");
    hoursReport = await getHoursReport(user, parsed.success ? parsed.data : {});
  } else if (tab === "despesas") {
    const parsed = expensesReportFilterSchema.safeParse(flat);
    const { getExpensesReport } = await import("@/lib/db/reports");
    expensesReport = await getExpensesReport(
      user,
      parsed.success ? parsed.data : {},
    );
  } else {
    const parsed = consolidatedReportFilterSchema.safeParse(flat);
    const { getConsolidatedReport } = await import("@/lib/db/reports");
    consolidatedReport = await getConsolidatedReport(
      user,
      parsed.success ? parsed.data : {},
    );
  }

  return (
    <div className="space-y-6">
      {header}
      <ReportsView
        mode="db"
        tab={tab}
        includeFinancials={includeFinancials}
        filterOptions={filterOptions}
        rawParams={flat}
        hoursReport={hoursReport}
        expensesReport={expensesReport}
        consolidatedReport={consolidatedReport}
      />
    </div>
  );
}
