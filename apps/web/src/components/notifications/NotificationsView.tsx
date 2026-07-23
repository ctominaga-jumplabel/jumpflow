"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type { NotificationView } from "@/lib/db/notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/app/notificacoes/actions";

export interface NotificationsViewProps {
  notifications: NotificationView[];
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Full notification list with unread highlight and mark-as-read controls. */
export function NotificationsView({ notifications }: NotificationsViewProps) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const unread = notifications.filter((n) => !n.read).length;

  function markAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  function openItem(notification: NotificationView) {
    startTransition(async () => {
      if (!notification.read) {
        await markNotificationReadAction({ id: notification.id });
      }
      if (notification.href) router.push(notification.href);
      else router.refresh();
    });
  }

  function markOneRead(notification: NotificationView) {
    startTransition(async () => {
      await markNotificationReadAction({ id: notification.id });
      router.refresh();
    });
  }

  return (
    <SectionPanel
      title="Suas notificações"
      description={
        unread > 0
          ? `${unread} não lida(s) de ${notifications.length}`
          : `${notifications.length} notificação(ões)`
      }
      action={
        unread > 0 ? (
          <ActionButton
            variant="secondary"
            size="sm"
            icon={CheckCheck}
            disabled={isPending}
            onClick={markAllRead}
          >
            Marcar todas como lidas
          </ActionButton>
        ) : undefined
      }
    >
      {notifications.length === 0 ? (
        <div className="px-5 py-10">
          <EmptyState
            icon={Bell}
            title="Nenhuma notificação"
            description="Quando algo relevante acontecer na plataforma, você verá aqui."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                "flex items-start gap-3 px-5 py-4",
                !notification.read && "bg-brand-soft/40",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  notification.read ? "bg-transparent" : "bg-brand",
                )}
              />
              <button
                type="button"
                onClick={() => openItem(notification)}
                disabled={isPending}
                className={cn(
                  "min-w-0 flex-1 text-left disabled:opacity-60",
                  focusRing,
                )}
              >
                <span className="block text-sm font-medium text-strong">
                  {notification.title}
                </span>
                {notification.body ? (
                  <span className="mt-0.5 block text-xs text-soft">
                    {notification.body}
                  </span>
                ) : null}
                <span className="mt-1 block text-[11px] text-soft">
                  {formatWhen(notification.createdAt)}
                </span>
              </button>
              {!notification.read ? (
                <button
                  type="button"
                  onClick={() => markOneRead(notification)}
                  disabled={isPending}
                  aria-label="Marcar como lida"
                  title="Marcar como lida"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-md border border-border text-medium hover:bg-surface-muted hover:text-strong disabled:opacity-60",
                    focusRing,
                  )}
                >
                  <Check aria-hidden="true" className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionPanel>
  );
}
