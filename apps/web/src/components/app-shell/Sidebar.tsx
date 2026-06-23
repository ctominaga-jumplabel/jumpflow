"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { appConfig } from "@/config/app";
import {
  adminNavigation,
  canSeeNavItem,
  canSeeNavItemByMatrix,
  findActiveNav,
  primaryNavigation,
} from "@/lib/navigation";
import type { RoleName } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { NavItem } from "./NavItem";

export interface SidebarProps {
  /** Called after navigating (closes the mobile drawer). */
  onNavigate?: () => void;
  /** Whether a real database connection is configured. */
  databaseConfigured?: boolean;
  /** Current user's roles, used to gate role-restricted items. */
  roles?: RoleName[];
  /**
   * Permission codes (from the matrix) the user may VIEW. Items with a
   * `permissionCode` not in this set are hidden. Items without a code are
   * always shown (subject to the legacy role gate).
   */
  viewableNavCodes?: string[];
  className?: string;
}

/** Primary navigation rail. Shared by the desktop rail and mobile drawer. */
export function Sidebar({
  onNavigate,
  databaseConfigured = false,
  roles = [],
  viewableNavCodes = [],
  className,
}: SidebarProps) {
  const pathname = usePathname();
  const activeHref = findActiveNav(pathname)?.href;
  const viewable = new Set(viewableNavCodes);
  // Items WITH a permissionCode are gated solely by the matrix (so admins can
  // grant/revoke menu visibility from the Matriz de Permissões). Items WITHOUT
  // one keep the legacy static role gate.
  const canSee = (item: (typeof primaryNavigation)[number]) =>
    item.permissionCode
      ? canSeeNavItemByMatrix(item, viewable)
      : canSeeNavItem(item, roles);
  const primaryItems = primaryNavigation.filter(canSee);
  const adminItems = adminNavigation.filter(canSee);

  return (
    <div className={cn("flex h-full flex-col bg-surface", className)}>
      <div className="flex h-16 items-center gap-3 border-b-2 border-ink px-5">
        <Link
          href="/app"
          onClick={onNavigate}
          aria-label={`${appConfig.name} — ir para a tela inicial`}
          className={cn("flex items-center gap-3 rounded-md", focusRing)}
        >
          <span className="grid size-9 place-items-center rounded-md border-2 border-ink bg-brand text-sm font-bold text-white shadow-[2px_2px_0_0_var(--color-ink)]">
            {appConfig.monogram}
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">
              Jump
            </span>
            <span className="text-sm font-semibold text-strong">
              {appConfig.name}
            </span>
          </span>
        </Link>
      </div>

      <nav
        aria-label="Navegação principal"
        className="flex-1 space-y-1 overflow-y-auto px-3 py-4"
      >
        {primaryItems.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={item.href === activeHref}
            onNavigate={onNavigate}
          />
        ))}

        {adminItems.length > 0 ? (
          <div className="pt-4">
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-soft">
              Administração
            </p>
            {adminItems.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                active={item.href === activeHref}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : null}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <p className="text-xs leading-5 text-soft">
          {databaseConfigured
            ? "Ambiente de validação. Dados fictícios persistidos em banco."
            : "Ambiente de demonstração. Dados mockados, sem conexão com banco."}
        </p>
      </div>
    </div>
  );
}
