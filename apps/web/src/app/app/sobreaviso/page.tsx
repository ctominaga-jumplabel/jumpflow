import type { Metadata } from "next";
import { BellRing, Database } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SobreavisoView } from "@/components/oncall/SobreavisoView";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isStorageConfigured } from "@/lib/storage/provider";

export const metadata: Metadata = { title: "Sobreaviso" };

const APPROVER_ROLES = ["ADMIN", "AREA_MANAGER", "PROJECT_MANAGER"];

/**
 * Sobreaviso (on-call): a consultant records on-call hours with a remuneration
 * multiplier and the responsible's "ok" attachment; a manager approves/rejects.
 */
export default async function SobreavisoPage() {
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const isApprover = user.roles.some((role) => APPROVER_ROLES.includes(role));

  const header = (
    <PageHeader
      eyebrow="Operação"
      title="Sobreaviso"
      description="Lançamento de horas de sobreaviso com fator de remuneração e anexo do ok do responsável; aprovação pelo gestor."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Database}
          title="Banco não configurado"
          description="O sobreaviso é persistido no banco. Configure a conexão para lançar e aprovar."
        />
      </div>
    );
  }

  const { getConsultantForUser } = await import("@/lib/db/timesheet");
  const { listOnCallEntries, listOnCallProjects } = await import("@/lib/db/oncall");

  const consultant = await getConsultantForUser(user);
  if (!consultant && !isApprover) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={BellRing}
          title="Sem vínculo de consultor"
          description="Seu usuário não está vinculado a um consultor. Contate um administrador."
        />
      </div>
    );
  }

  const [entries, projects] = await Promise.all([
    listOnCallEntries(isApprover ? {} : { consultantId: consultant!.id }),
    listOnCallProjects(),
  ]);

  return (
    <div className="space-y-6">
      {header}
      <SobreavisoView
        entries={entries}
        projects={projects}
        today={today}
        canCreate={Boolean(consultant)}
        canApprove={isApprover}
        storageAvailable={isStorageConfigured()}
      />
    </div>
  );
}
