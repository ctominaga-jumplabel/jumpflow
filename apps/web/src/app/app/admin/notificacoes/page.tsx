import type { Metadata } from "next";
import { BellRing } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationRulesView } from "@/components/admin/NotificationRulesView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";

export const metadata: Metadata = { title: "Regras de Notificação" };

/**
 * Admin-only notification rules (`/app/admin/notificacoes`). Configures, per
 * event, who is notified and through which channel — the rules the notification
 * engine reads at runtime. ADMIN-only; every change is audited.
 */
export default async function NotificacoesPage() {
  await requireRole(["ADMIN"]);

  const header = (
    <PageHeader
      eyebrow="Administração"
      title="Regras de Notificação"
      description="Defina, por evento, quem é notificado e por qual canal (e-mail ou Teams). As regras alimentam o motor de notificações."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={BellRing}
          title="Banco não configurado"
          description="As regras de notificação são persistidas no banco. Configure a conexão para administrá-las."
        />
      </div>
    );
  }

  const { listNotificationRules, listProjectsForScope } = await import(
    "@/lib/db/notification-rules"
  );
  const [rules, projects] = await Promise.all([
    listNotificationRules(),
    listProjectsForScope(),
  ]);

  return (
    <div className="space-y-6">
      {header}
      <NotificationRulesView rules={rules} projects={projects} />
    </div>
  );
}
