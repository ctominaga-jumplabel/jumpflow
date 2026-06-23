import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PermissionMatrixView } from "@/components/admin/PermissionMatrixView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";

export const metadata: Metadata = { title: "Matriz de Permissões" };

/**
 * Admin-only Permission Matrix (`/app/admin/permissoes`). `requireRole(["ADMIN"])`
 * redirects everyone else to /access-denied. Configures, per access group, what
 * each feature allows (view/create/edit/delete) — the database-driven RBAC the
 * platform reads at runtime. Every change is audited.
 *
 * Without a database we show an honest empty state: the matrix is persisted, so
 * there is nothing to configure offline.
 */
export default async function PermissoesPage() {
  await requireRole(["ADMIN"]);

  const header = (
    <PageHeader
      eyebrow="Administração"
      title="Matriz de Permissões"
      description="Configure, por grupo de acesso, o que cada funcionalidade permite. Mudanças são aplicadas em tempo real e auditadas."
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
      <PermissionMatrixView
        roles={roles}
        permissions={permissions}
        matrices={matrices}
      />
    </div>
  );
}
