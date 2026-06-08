"use client";

import { Bell, Menu, Search } from "lucide-react";
import { mockUser } from "@/lib/mock-data/user";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface TopbarProps {
  /** Opens the mobile navigation drawer. */
  onMenuClick: () => void;
}

/** Top application bar: mobile menu, search, environment flag and mock user. */
export function Topbar({ onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Abrir navegação"
        className="grid size-9 place-items-center rounded-md border border-border text-medium outline-none transition-colors hover:bg-surface-muted hover:text-strong focus-visible:ring-2 focus-visible:ring-brand lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      {/* Search (mock, no behaviour yet) */}
      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-soft"
        />
        <input
          type="search"
          placeholder="Buscar projetos, consultores, horas..."
          aria-label="Buscar"
          className="h-9 w-full rounded-md border border-border bg-canvas pl-9 pr-3 text-sm text-strong placeholder:text-soft outline-none transition-colors focus:border-brand focus:bg-surface focus-visible:ring-2 focus-visible:ring-brand/40"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <StatusBadge tone="warning" className="hidden sm:inline-flex">
          Ambiente MVP
        </StatusBadge>

        <button
          type="button"
          aria-label="Notificações"
          className="relative grid size-9 place-items-center rounded-md border border-border text-medium outline-none transition-colors hover:bg-surface-muted hover:text-strong focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Bell aria-hidden="true" className="size-5" />
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 size-1.5 rounded-full bg-danger"
          />
        </button>

        <div className="flex items-center gap-3 rounded-md border border-transparent py-1 pl-2 sm:border-border sm:pl-1 sm:pr-3">
          <span className="grid size-8 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
            {mockUser.initials}
          </span>
          <span className="hidden flex-col leading-tight sm:flex">
            <span className="text-sm font-medium text-strong">
              {mockUser.name}
            </span>
            <span className="text-xs text-soft">{mockUser.role}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
