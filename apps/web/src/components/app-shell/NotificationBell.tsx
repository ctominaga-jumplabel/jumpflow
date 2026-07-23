"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type { NotificationView } from "@/lib/db/notifications";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/app/notificacoes/actions";

const iconButton =
  "grid size-9 place-items-center rounded-md border border-border text-medium transition-colors hover:bg-surface-muted hover:text-strong";

export interface NotificationBellProps {
  /** Most recent notifications (already scoped to the user), newest first. */
  notifications: NotificationView[];
  /** Unread count — drives the badge (shown only when > 0). */
  unreadCount: number;
}

/** Relative pt-BR time label ("agora", "há 5 min", "há 2 h", "há 3 d"). */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  return new Date(iso).toLocaleDateString("pt-BR", { dateStyle: "short" });
}

/**
 * Item 3 — real notification center. The bell opens a dropdown listing the
 * user's recent notifications; the badge shows the number of UNREAD ones and is
 * hidden entirely when there are none (no more "phantom" count). Clicking an
 * item marks it read and navigates to its deep-link; "Marcar todas como lidas"
 * clears the badge; "Ver todas" opens the full page.
 */
export function NotificationBell({
  notifications,
  unreadCount,
}: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape while the panel is open.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const hasUnread = unreadCount > 0;
  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  function markAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  function openItem(notification: NotificationView) {
    setOpen(false);
    startTransition(async () => {
      if (!notification.read) {
        await markNotificationReadAction({ id: notification.id });
      }
      if (notification.href) router.push(notification.href);
      router.refresh();
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          hasUnread
            ? `Notificações: ${unreadCount} não lida(s)`
            : "Notificações: nenhuma não lida"
        }
        className={cn(iconButton, focusRing, "relative")}
      >
        <Bell aria-hidden="true" className="size-5" />
        {hasUnread ? (
          <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full border border-surface bg-danger px-1 text-[10px] font-bold leading-none text-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold text-strong">Notificações</span>
            {hasUnread ? (
              <button
                type="button"
                onClick={markAllRead}
                disabled={isPending}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-medium hover:text-strong disabled:opacity-60",
                  focusRing,
                )}
              >
                <CheckCheck aria-hidden="true" className="size-3.5" />
                Marcar todas como lidas
              </button>
            ) : null}
          </div>

          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-soft">
              Você não tem notificações.
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openItem(notification)}
                    disabled={isPending}
                    className={cn(
                      "flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-surface-muted/60 disabled:opacity-60",
                      focusRing,
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
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-strong">
                        {notification.title}
                      </span>
                      {notification.body ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs text-soft">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block text-[11px] text-soft">
                        {relativeTime(notification.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="border-t border-border px-4 py-2 text-center">
            <Link
              href="/app/notificacoes"
              onClick={() => setOpen(false)}
              className={cn(
                "inline-block rounded-md px-2 py-1 text-xs font-semibold text-brand hover:underline",
                focusRing,
              )}
            >
              Ver todas
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
