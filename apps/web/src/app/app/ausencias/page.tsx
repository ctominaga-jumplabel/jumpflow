import type { Metadata } from "next";
import { Plane, UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AbsencesView } from "@/components/absences/AbsencesView";
import { requireUser } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { PendingTimeOffItem, TimeOffListItem } from "@/lib/db/time-off-view";

export const metadata: Metadata = { title: "Ausências" };

/** Papéis que decidem/gerenciam ausências (gate People). */
const TIME_OFF_MANAGER_ROLES = ["ADMIN", "PEOPLE"] as const;

/**
 * Ausências (`/app/ausencias`). Tela adaptativa por perfil (padrão de Horas):
 * - Consultor: solicita as próprias ausências (férias/licença/outra) e cancela
 *   as que ainda estão vivas.
 * - ADMIN/PEOPLE: decidem (aprovar/reprovar com justificativa) os pedidos
 *   REQUESTED de todos os consultores.
 *
 * A autorização é enforced no servidor (aqui via `requireUser` + `hasRole`, e
 * nas server actions via `requireRole`/`requireUser`). A visibilidade do menu é
 * governada pela matriz (permissão AUSENCIAS).
 */
export default async function AusenciasPage() {
  const user = await requireUser();

  const header = (
    <PageHeader
      eyebrow="Operação"
      title="Ausências"
      description="Solicitação e aprovação de férias, licenças e outras ausências."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={Plane}
          title="Banco não configurado"
          description="As ausências são persistidas no banco. Configure a conexão para usá-las."
        />
      </div>
    );
  }

  const { getConsultantForUser } = await import("@/lib/db/timesheet");
  const {
    listTimeOffForConsultant,
    getVacationBalanceForConsultant,
    listPendingTimeOffRequests,
  } = await import("@/lib/db/time-off-view");

  const consultant = await getConsultantForUser(user);
  const canDecide = hasRole(user, [...TIME_OFF_MANAGER_ROLES]);

  if (!consultant && !canDecide) {
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

  let own:
    | { items: TimeOffListItem[]; vacationBalanceDays: number | null }
    | undefined;
  if (consultant) {
    const [items, vacationBalanceDays] = await Promise.all([
      listTimeOffForConsultant(consultant.id),
      getVacationBalanceForConsultant(consultant.id),
    ]);
    own = { items, vacationBalanceDays };
  }

  let pending: PendingTimeOffItem[] | undefined;
  if (canDecide) {
    pending = await listPendingTimeOffRequests();
  }

  return (
    <div className="space-y-6">
      {header}
      <AbsencesView own={own} pending={pending} canDecide={canDecide} />
    </div>
  );
}
