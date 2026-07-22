"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { NavItemDef } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

export interface NavItemProps {
  item: NavItemDef;
  active: boolean;
  /** Called after navigation (used to close the mobile drawer). */
  onNavigate?: () => void;
  /**
   * Collapsed desktop rail (P11): render icon-only, centered, with the label
   * exposed as a native tooltip + accessible name. Labels stay visible on the
   * mobile drawer (never collapsed).
   */
  collapsed?: boolean;
}

/** Single sidebar navigation entry with active state. */
export function NavItem({ item, active, onNavigate, collapsed = false }: NavItemProps) {
  const { href, label, icon: Icon, external } = item;

  // External items (e.g. the JumpAcademy portal) open in a new tab and are
  // never marked active, so they always use the inactive styling.
  const className = cn(
    "group flex items-center rounded-md border-2 py-2 text-sm font-medium transition-[background-color,color,box-shadow]",
    collapsed ? "justify-center px-0" : "gap-3 px-3",
    focusRing,
    active
      ? "border-ink bg-brand-soft font-semibold text-brand-dark shadow-[2px_2px_0_0_var(--color-ink)]"
      : "border-transparent text-medium hover:bg-surface-muted hover:text-strong",
  );

  const iconClassName = cn(
    "size-[18px] shrink-0",
    active ? "text-brand" : "text-soft group-hover:text-medium",
  );

  // When collapsed the label is hidden, so surface it as a tooltip + a11y name.
  const collapsedA11y = collapsed
    ? { title: label, "aria-label": label }
    : {};

  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        className={className}
        {...collapsedA11y}
      >
        <Icon aria-hidden="true" className={iconClassName} />
        {collapsed ? null : (
          <>
            <span className="truncate">{label}</span>
            <ExternalLink
              aria-label="abre em nova aba"
              className="ml-auto size-3.5 shrink-0 text-soft group-hover:text-medium"
            />
          </>
        )}
      </a>
    );
  }

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={className}
      {...collapsedA11y}
    >
      <Icon aria-hidden="true" className={iconClassName} />
      {collapsed ? null : <span className="truncate">{label}</span>}
    </Link>
  );
}
