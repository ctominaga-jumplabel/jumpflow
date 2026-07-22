"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { Bell, LogOut, Maximize, Menu, Minimize } from "lucide-react";
import type { AppUser } from "@/lib/auth/types";
import { primaryRoleLabel } from "@/lib/auth/roles";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

const iconButton =
  "grid size-9 place-items-center rounded-md border border-border text-medium transition-colors hover:bg-surface-muted hover:text-strong";

export interface TopbarProps {
  user: AppUser;
  /** Server action that signs the user out. */
  logoutAction: () => void | Promise<void>;
  /** Opens the mobile navigation drawer. */
  onMenuClick: () => void;
  /**
   * Total actionable pending items (P20). A numeric badge is shown only when
   * greater than zero; zero renders a plain bell with no badge.
   */
  notificationCount?: number;
}

/** Build up to two-letter initials from a display name. */
function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Top application bar: mobile menu, notifications, fullscreen toggle,
 * environment flag, user and logout. The mock search field was removed (P21).
 */
export function Topbar({
  user,
  logoutAction,
  onMenuClick,
  notificationCount = 0,
}: TopbarProps) {
  const hasPending = notificationCount > 0;
  const badgeLabel = notificationCount > 99 ? "99+" : String(notificationCount);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir navegação"
        className={cn(iconButton, focusRing, "lg:hidden")}
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <StatusBadge tone="warning" className="hidden sm:inline-flex">
          Ambiente MVP
        </StatusBadge>

        <FullscreenButton />

        {/* P20: notificações reais — leva ao Início, onde as pendências por
            perfil estão detalhadas com seus badges. Sem ponto decorativo: o
            número só aparece quando há pendências acionáveis (> 0). */}
        <Link
          href="/app"
          aria-label={
            hasPending
              ? `Notificações: ${notificationCount} pendência(s)`
              : "Notificações: nenhuma pendência"
          }
          className={cn(iconButton, focusRing, "relative")}
        >
          <Bell aria-hidden="true" className="size-5" />
          {hasPending ? (
            <span className="absolute -right-1.5 -top-1.5 grid min-w-[18px] place-items-center rounded-full border border-surface bg-danger px-1 text-[10px] font-bold leading-none text-white">
              {badgeLabel}
            </span>
          ) : null}
        </Link>

        <div className="flex items-center gap-3 rounded-md border border-transparent py-1 pl-2 sm:border-border sm:pl-1 sm:pr-3">
          <span className="grid size-8 place-items-center rounded-full border-2 border-ink bg-brand text-xs font-semibold text-white">
            {initialsFromName(user.name)}
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-medium text-strong">{user.name}</span>
            <span className="text-xs text-soft">
              {primaryRoleLabel(user.roles)}
            </span>
          </span>
        </div>

        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Sair"
            className={cn(iconButton, focusRing)}
          >
            <LogOut aria-hidden="true" className="size-5" />
          </button>
        </form>
      </div>
    </header>
  );
}

/** Never-firing subscription for a static (environment-level) snapshot. */
function noopSubscribe() {
  return () => {};
}

function subscribeFullscreen(onChange: () => void) {
  document.addEventListener("fullscreenchange", onChange);
  return () => document.removeEventListener("fullscreenchange", onChange);
}

/**
 * P10 — Fullscreen toggle. Uses the Fullscreen API on the document element and
 * stays in sync with `fullscreenchange` (covers Esc / F11 exits) via
 * `useSyncExternalStore` — hydration-safe and without setting state inside an
 * effect. When the browser has no support, the control is hidden.
 */
function FullscreenButton() {
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => typeof document.documentElement.requestFullscreen === "function",
    () => false,
  );
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => Boolean(document.fullscreenElement),
    () => false,
  );

  if (!supported) return null;

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isFullscreen}
      aria-label={isFullscreen ? "Sair da tela cheia" : "Entrar em tela cheia"}
      title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
      className={cn(iconButton, focusRing)}
    >
      {isFullscreen ? (
        <Minimize aria-hidden="true" className="size-5" />
      ) : (
        <Maximize aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}
