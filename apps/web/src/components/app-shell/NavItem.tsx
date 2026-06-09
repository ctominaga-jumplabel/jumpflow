"use client";

import Link from "next/link";
import type { NavItemDef } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

export interface NavItemProps {
  item: NavItemDef;
  active: boolean;
  /** Called after navigation (used to close the mobile drawer). */
  onNavigate?: () => void;
}

/** Single sidebar navigation entry with active state. */
export function NavItem({ item, active, onNavigate }: NavItemProps) {
  const { href, label, icon: Icon } = item;

  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-md border-2 px-3 py-2 text-sm font-medium transition-[background-color,color,box-shadow]",
        focusRing,
        active
          ? "border-ink bg-brand-soft font-semibold text-brand-dark shadow-[2px_2px_0_0_var(--color-ink)]"
          : "border-transparent text-medium hover:bg-surface-muted hover:text-strong",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-[18px] shrink-0",
          active ? "text-brand" : "text-soft group-hover:text-medium",
        )}
      />
      <span className="truncate">{label}</span>
    </Link>
  );
}
