import type { Metadata } from "next";
import { DatabaseZap } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AutoApprovalView } from "@/components/automation/AutoApprovalView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { AutoApprovalOverview } from "@/lib/db/automation";

export const metadata: Metadata = { title: "Aprovação automática" };

/**
 * Admin/observability screen for the auto-approval engine. Management only
 * (ADMIN, AREA_MANAGER) — `requireRole` redirects others to /access-denied.
 *
 * Without a database we show an honest banner and an empty state instead of
 * faking data: the engine reads from the DB, so there is nothing to observe.
 */
export default async function AprovacaoAutomaticaPage() {
  await requireRole(["ADMIN", "AREA_MANAGER"]);

  const header = (
    <PageHeader
      eyebrow="Automação"
      title="Aprovação automática"
      description="Configuração, exceções, últimas aprovações automáticas e lançamentos pendentes do motor de aprovação."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={DatabaseZap}
          title="Banco não configurado"
          description="A aprovação automática lê e grava no banco de dados. Configure a conexão para observar a automação e executá-la sob demanda."
        />
      </div>
    );
  }

  // Lazy import so Prisma is never loaded without a database.
  const { getAutoApprovalOverview } = await import("@/lib/db/automation");
  const overview: AutoApprovalOverview = await getAutoApprovalOverview();

  return (
    <div className="space-y-6">
      {header}
      <AutoApprovalView overview={overview} />
    </div>
  );
}
