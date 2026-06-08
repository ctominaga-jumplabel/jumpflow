"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { appConfig } from "@/config/app";
import { findActiveNav, primaryNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { NavItem } from "./NavItem";

export interface SidebarProps {
  /** Called after navigating (closes the mobile drawer). */
  onNavigate?: () => void;
  className?: string;
}

/** Primary navigation rail. Shared by the desktop rail and mobile drawer. */
export function Sidebar({ onNavigate, className }: SidebarProps) {
  const pathname = usePathname();
  const activeHref = findActiveNav(pathname)?.href;

  return (
    <div className={cn("flex h-full flex-col bg-surface", className)}>
      <div className="flex h-16 items-center gap-3 border-b border-border px-5">
        <Link
          href="/app/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-md"
        >
          <span className="grid size-9 place-items-center rounded-md bg-brand text-sm font-bold text-white">
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
        {primaryNavigation.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={item.href === activeHref}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="border-t border-border px-5 py-4">
        <p className="text-xs leading-5 text-soft">
          Ambiente de demonstração. Dados mockados, sem conexão com banco.
        </p>
      </div>
    </div>
  );
}
