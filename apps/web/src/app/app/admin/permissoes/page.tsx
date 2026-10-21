import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  PERMISSION_ADMIN_TABS,
  PermissionAdminView,
  type PermissionAdminTab,
} from "@/components/admin/PermissionAdminView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { navScreenRoutes } from "@/lib/navigation";

export const metadata: Metadata = { title: "Matriz de Permissões" };

/**
 * Admin-only Permission Matrix (`/app/admin/permissoes`). `requireRole(["ADMIN"])`
 * redirects everyone else to /access-denied. Configures, per access group, what
 * each feature allows (view/create/edit/delete) — the database-driven RBAC the
 * platform reads at runtime — plus the CRUD of access groups and features
 * (tabs "Grupos de acesso" / "Funcionalidades"). Every change is audited.
 *
 * Without a database we show an honest empty state: the matrix is persisted, so
 * there is nothing to configure offline.
 */
export default async function PermissoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireRole(["ADMIN"]);
  const { tab } = await searchParams;
  const initialTab = (PERMISSION_ADMIN_TABS as readonly string[]).includes(tab ?? "")
    ? (tab as PermissionAdminTab)
    : "matriz";

  const header = (
    <PageHeader
      eyebrow="Administração"
      title="Matriz de Permissões"
      description="Configure, por grupo de acesso, o que cada tela e funcionalidade permite, e mantenha o cadastro de grupos e funcionalidades. Mudanças são aplicadas em tempo real e auditadas."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={KeyRound}
          title="Banco não configurado"
          description="A matriz de permissões persiste grupos e funcionalidades no banco de dados. Configure a conexão para administrar permissões."
        />
      </div>
    );
  }

  // Lazy import so Prisma is never loaded without a database.
  const { listRoles, listPermissions, listAllRoleMatrices } = await import(
    "@/lib/db/permissions"
  );
  const [roles, permissions, matrices] = await Promise.all([
    listRoles(),
    listPermissions(),
    listAllRoleMatrices(),
  ]);

  return (
    <div className="space-y-6">
      {header}
      <PermissionAdminView
        roles={roles}
        permissions={permissions}
        matrices={matrices}
        screenRoutes={navScreenRoutes()}
        initialTab={initialTab}
      />
    </div>
  );
}
