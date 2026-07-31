"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { NavGroupDef } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { NavItem } from "./NavItem";

export interface NavGroupProps {
  group: NavGroupDef;
  /** Href da entrada ativa (resolvida pelo Sidebar via `findActiveNav`). */
  activeHref?: string;
  /**
   * Rail colapsado (P11): sem cabeçalho de grupo — os filhos viram itens
   * icon-only, iguais ao menu plano colapsado.
   */
  collapsed?: boolean;
  /** Chamado após navegar (fecha o drawer no mobile). */
  onNavigate?: () => void;
}

/**
 * Agrupador colapsável do menu (dropdown). Usado só no menu do Financeiro
 * (FINANCE/ADMIN). O cabeçalho abre/fecha a lista de filhos; abre por padrão
 * quando algum filho é a rota ativa. No rail colapsado degrada para os filhos
 * icon-only (sem cabeçalho), preservando o acesso.
 */
export function NavGroup({
  group,
  activeHref,
  collapsed = false,
  onNavigate,
}: NavGroupProps) {
  const { label, icon: Icon, children } = group;
  const hasActiveChild = children.some((child) => child.href === activeHref);
  const [open, setOpen] = useState(hasActiveChild);

  // Rail colapsado: renderiza os filhos como itens icon-only (sem o cabeçalho
  // do grupo), que já expõem o rótulo como tooltip.
  if (collapsed) {
    return (
      <>
        {children.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={item.href === activeHref}
            onNavigate={onNavigate}
            collapsed
          />
        ))}
      </>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center gap-3 rounded-md border-2 border-transparent px-3 py-2 text-sm font-medium text-medium transition-colors hover:bg-surface-muted hover:text-strong",
          focusRing,
        )}
      >
        <Icon
          aria-hidden="true"
          className="size-[18px] shrink-0 text-soft group-hover:text-medium"
        />
        <span className="truncate">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "ml-auto size-4 shrink-0 text-soft transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="mt-1 space-y-1 border-l border-border pl-2">
          {children.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              active={item.href === activeHref}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
