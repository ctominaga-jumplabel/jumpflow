"use client";

import { useState, type ReactNode } from "react";

export interface FinanceTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Client tab switcher for the Financeiro screen (P1): splits the financial
 * overview into "Contas a Receber" (revenue/client side) and "Contas a Pagar"
 * (expenses to consultants). The active tab is kept in local state and mirrored
 * to the URL (`?tab=`) with `history.replaceState`, so it survives a reload /
 * can be shared without triggering a full server round-trip. Content nodes are
 * rendered by the server and passed in as props; only the visible one mounts.
 */
export function FinanceTabs({
  tabs,
  defaultTabId,
  ariaLabel = "Visões do financeiro",
}: {
  tabs: FinanceTab[];
  defaultTabId?: string;
  /** Accessible label for the tablist (defaults to the financeiro wording). */
  ariaLabel?: string;
}) {
  const initial =
    tabs.find((tab) => tab.id === defaultTabId)?.id ?? tabs[0]?.id ?? "";
  const [activeId, setActiveId] = useState(initial);

  function selectTab(id: string) {
    setActiveId(id);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url.toString());
    }
  }

  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-label={ariaLabel}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {tabs.map((tab) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => selectTab(tab.id)}
              className={
                selected
                  ? "-mb-px border-b-2 border-ink px-4 py-2 text-sm font-semibold text-strong"
                  : "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium text-medium hover:text-strong"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">{active?.content}</div>
    </div>
  );
}
