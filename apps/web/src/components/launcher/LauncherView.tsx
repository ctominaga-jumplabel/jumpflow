import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type { LauncherShortcut } from "@/lib/launcher";

export interface LauncherViewProps {
  firstName: string;
  shortcuts: LauncherShortcut[];
}

/**
 * Operational launcher: large, tactile shortcuts to the user's frequent actions,
 * filtered by role and annotated with pending badges. The sidebar/topbar remain
 * for deep navigation; this is the consultant-first entry point.
 *
 * No parallax/scroll effects — per the design system, operational flows stay
 * calm. The only motion is the shared tactile button press (transform/shadow),
 * which `prefers-reduced-motion` neutralizes globally.
 */
export function LauncherView({ firstName, shortcuts }: LauncherViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-soft">
          {firstName ? `Olá, ${firstName}` : "Bem-vindo"}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-strong">
          O que você quer fazer agora?
        </h1>
        <p className="mt-1 text-sm text-medium">
          Atalhos para suas ações mais frequentes. Use o menu lateral para a
          navegação completa.
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;
          return (
            <li key={shortcut.key}>
              <Link
                href={shortcut.href}
                className={cn(
                  "group flex h-full flex-col gap-3 rounded-[var(--radius-card)] border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[5px_5px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]",
                  focusRing,
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-11 place-items-center rounded-md border-2 border-ink bg-brand-soft text-brand-dark shadow-[2px_2px_0_0_var(--color-ink)]">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  {shortcut.badge ? (
                    <StatusBadge tone={shortcut.badge.tone}>
                      {shortcut.badge.count} {shortcut.badge.label}
                    </StatusBadge>
                  ) : null}
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-semibold text-strong">
                    {shortcut.label}
                  </h2>
                  <p className="mt-0.5 text-sm text-medium">
                    {shortcut.description}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
                  Abrir
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                  />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
