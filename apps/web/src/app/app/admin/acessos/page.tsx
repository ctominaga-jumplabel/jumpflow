import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { AccessAdminView } from "@/components/admin/AccessAdminView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import type {
  AccessUserView,
  PendingInvitationView,
} from "@/lib/db/invitations";

export const metadata: Metadata = { title: "Acessos" };

/**
 * Admin-only access management (`/app/admin/acessos`). `requireRole(["ADMIN"])`
 * redirects everyone else to /access-denied. Lists users (roles + status +
 * last login), pending invitations, and the invite form.
 *
 * Without a database we show an honest empty state instead of faking data:
 * invitations and RBAC are persisted, so there is nothing to manage offline.
 */
export default async function AcessosPage() {
  await requireRole(["ADMIN"]);

  const header = (
    <PageHeader
      eyebrow="Administração"
      title="Acessos"
      description="Convide pessoas, defina grupos de acesso e bloqueie ou reative usuários. Mudanças de grupo e status são auditadas."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={ShieldCheck}
          title="Banco não configurado"
          description="A gestão de acessos persiste convites e grupos no banco de dados. Configure a conexão para convidar e gerenciar usuários."
        />
      </div>
    );
  }

  // Lazy import so Prisma is never loaded without a database.
  const { listAccessUsers, listPendingInvitations } = await import(
    "@/lib/db/invitations"
  );
  const [users, invitations]: [AccessUserView[], PendingInvitationView[]] =
    await Promise.all([listAccessUsers(), listPendingInvitations()]);

  return (
    <div className="space-y-6">
      {header}
      <AccessAdminView users={users} invitations={invitations} />
    </div>
  );
}
