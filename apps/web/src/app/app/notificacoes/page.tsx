import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { NotificationView } from "@/lib/db/notifications";
import { NotificationsView } from "@/components/notifications/NotificationsView";

export const metadata: Metadata = { title: "Notificações" };

/**
 * Notification center (item 3) — the full inbox behind the top-bar bell. Lists
 * the user's own notifications (scoped server-side by real db id) with unread
 * highlighting and mark-as-read. Fails safe to an empty list without a database.
 */
export default async function NotificacoesPage() {
  const user = await requireUser();

  let notifications: NotificationView[] = [];
  if (isDatabaseConfigured()) {
    try {
      const { resolveDbUser } = await import("@/lib/db/users");
      const dbUser = await resolveDbUser(user);
      if (dbUser) {
        const { listUserNotifications } = await import("@/lib/db/notifications");
        notifications = await listUserNotifications(dbUser.id, { limit: 50 });
      }
    } catch (error) {
      console.error("[notificacoes] load failed", error);
      notifications = [];
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conta"
        title="Notificações"
        description="Suas notificações da plataforma. As não lidas aparecem em destaque e alimentam o sino do topo."
      />
      <NotificationsView notifications={notifications} />
    </div>
  );
}
