"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { appConfig } from "@/config/app";
import {
  adminNavigation,
  applyNavOrder,
  canSeeNavItem,
  canSeeNavItemByMatrix,
  findActiveNav,
  primaryNavigation,
} from "@/lib/navigation";
import type { RoleName } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { BrandMark } from "@/components/brand/BrandMark";
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
  /**
   * Persisted `href → position` order for the primary rail (P28). Applied on
   * top of the default catalog order; unknown items keep the default order.
   */
  navOrder?: Record<string, number>;
  /**
   * Desktop collapse state (P11). When collapsed the rail shows icon-only
   * entries with tooltips. Undefined on the mobile drawer (never collapsed).
   */
  collapsed?: boolean;
  /** Toggles the desktop collapse state. Only rendered when provided. */
  onToggleCollapse?: () => void;
  className?: string;
}

/** Primary navigation rail. Shared by the desktop rail and mobile drawer. */
export function Sidebar({
  onNavigate,
  databaseConfigured = false,
  roles = [],
  viewableNavCodes = [],
  navOrder = {},
  collapsed = false,
  onToggleCollapse,
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
  // Apply the persisted order first, then role/matrix visibility (order is a
  // full-catalog concept; filtering after keeps the relative order intact).
  const primaryItems = applyNavOrder(primaryNavigation, navOrder).filter(canSee);
  const adminItems = adminNavigation.filter(canSee);

  return (
    <div className={cn("flex h-full flex-col bg-surface", className)}>
      <div
        className={cn(
          "flex h-16 items-center border-b-2 border-ink",
          collapsed ? "justify-center px-2" : "gap-3 px-5",
        )}
      >
        <Link
          href="/app"
          onClick={onNavigate}
          aria-label={`${appConfig.name} — ir para a tela inicial`}
          className={cn("flex items-center gap-3 rounded-md", focusRing)}
        >
          <BrandMark size={36} />
          {collapsed ? null : (
            <span className="flex flex-col leading-tight">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">
                Jump
              </span>
              <span className="text-sm font-semibold text-strong">
                {appConfig.name}
              </span>
            </span>
          )}
        </Link>
      </div>

      <nav
        aria-label="Navegação principal"
        className={cn(
          "flex-1 space-y-1 overflow-y-auto py-4",
          collapsed ? "px-2" : "px-3",
        )}
      >
        {onToggleCollapse ? (
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "group mb-1 flex w-full items-center rounded-md border-2 border-transparent py-2 text-sm font-medium text-medium transition-colors hover:bg-surface-muted hover:text-strong",
              collapsed ? "justify-center px-0" : "gap-3 px-3",
              focusRing,
            )}
          >
            {collapsed ? (
              <PanelLeftOpen
                aria-hidden="true"
                className="size-[18px] shrink-0 text-soft group-hover:text-medium"
              />
            ) : (
              <PanelLeftClose
                aria-hidden="true"
                className="size-[18px] shrink-0 text-soft group-hover:text-medium"
              />
            )}
            {collapsed ? null : <span className="truncate">Recolher menu</span>}
          </button>
        ) : null}

        {primaryItems.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={item.href === activeHref}
            onNavigate={onNavigate}
            collapsed={collapsed}
          />
        ))}

        {adminItems.length > 0 ? (
          <div className="pt-4">
            {collapsed ? (
              <div
                aria-hidden="true"
                className="mx-auto mb-1 h-px w-6 bg-border"
              />
            ) : (
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-soft">
                Administração
              </p>
            )}
            {adminItems.map((item) => (
              <NavItem
                key={item.href}
                item={item}
                active={item.href === activeHref}
                onNavigate={onNavigate}
                collapsed={collapsed}
              />
            ))}
          </div>
        ) : null}
      </nav>

      {collapsed ? null : (
        <div className="border-t border-border px-5 py-4">
          <p className="text-xs leading-5 text-soft">
            {databaseConfigured
              ? "Ambiente de validação. Dados fictícios persistidos em banco."
              : "Ambiente de demonstração. Dados mockados, sem conexão com banco."}
          </p>
        </div>
      )}
    </div>
  );
}
