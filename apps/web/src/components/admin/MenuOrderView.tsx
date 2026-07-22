"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { applyNavOrder, primaryNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { saveMenuOrder } from "@/app/app/admin/menu/actions";

interface MenuItemLite {
  key: string;
  label: string;
}

/** Build the initial ordered list from the persisted order + default catalog. */
function buildInitial(savedOrder: Record<string, number>): MenuItemLite[] {
  return applyNavOrder([...primaryNavigation], savedOrder).map((item) => ({
    key: item.href,
    label: item.label,
  }));
}

const defaultOrder: MenuItemLite[] = primaryNavigation.map((item) => ({
  key: item.href,
  label: item.label,
}));

export interface MenuOrderViewProps {
  /** Persisted `href → position` order. */
  savedOrder: Record<string, number>;
}

/**
 * Reorder the primary menu (P28). Accessible up/down controls (no drag needed
 * for keyboard/screen-reader users). Saving persists the GLOBAL order via a
 * server action; the sidebar picks it up on the next navigation.
 */
export function MenuOrderView({ savedOrder }: MenuOrderViewProps) {
  const [items, setItems] = useState<MenuItemLite[]>(() =>
    buildInitial(savedOrder),
  );
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const move = (index: number, delta: number) => {
    setMsg(null);
    setItems((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const restoreDefault = () => {
    setMsg(null);
    setItems(defaultOrder);
  };

  const save = () => {
    setMsg(null);
    start(async () => {
      const result = await saveMenuOrder({ keys: items.map((i) => i.key) });
      setMsg(
        result.ok
          ? { ok: true, text: "Ordem do menu salva." }
          : { ok: false, text: result.message },
      );
    });
  };

  return (
    <SectionPanel
      title="Ordem do menu principal"
      description="Reordene os itens com as setas. A ordem é global (vale para toda a organização) e passa a valer na próxima navegação."
    >
      <div className="px-5 py-4">
        <ol className="space-y-1.5">
          {items.map((item, index) => (
            <li
              key={item.key}
              className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
            >
              <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-soft">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-strong">
                {item.label}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0 || pending}
                  aria-label={`Mover ${item.label} para cima`}
                  className={cn(
                    "grid size-8 place-items-center rounded-md border border-border text-medium transition-colors hover:bg-surface-muted hover:text-strong disabled:cursor-not-allowed disabled:opacity-40",
                    focusRing,
                  )}
                >
                  <ChevronUp aria-hidden="true" className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1 || pending}
                  aria-label={`Mover ${item.label} para baixo`}
                  className={cn(
                    "grid size-8 place-items-center rounded-md border border-border text-medium transition-colors hover:bg-surface-muted hover:text-strong disabled:cursor-not-allowed disabled:opacity-40",
                    focusRing,
                  )}
                >
                  <ChevronDown aria-hidden="true" className="size-4" />
                </button>
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionButton
            type="button"
            variant="primary"
            size="sm"
            onClick={save}
            disabled={pending}
          >
            {pending ? "Salvando..." : "Salvar ordem"}
          </ActionButton>
          <ActionButton
            type="button"
            variant="secondary"
            size="sm"
            icon={RotateCcw}
            onClick={restoreDefault}
            disabled={pending}
          >
            Restaurar padrão
          </ActionButton>
          {msg ? (
            <span
              role="status"
              className={cn(
                "text-xs font-semibold",
                msg.ok ? "text-success" : "text-danger",
              )}
            >
              {msg.text}
            </span>
          ) : null}
        </div>
      </div>
    </SectionPanel>
  );
}
