"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";

export interface MultiSelectOption {
  id: string;
  name: string;
}

export interface MultiSelectComboProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Trigger text when nothing is selected (e.g. "Todos os projetos"). */
  placeholder: string;
  /** Builds the trigger text for 2+ selected items. */
  pluralLabel: (count: number) => string;
  emptyText: string;
  searchPlaceholder?: string;
  className?: string;
}

/** Lowercase + strip accents so "ache" matches "Aché". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Combo box de multi-seleção com checkboxes e filtro por digitação. Ao abrir,
 * o foco vai para o campo de busca; o filtro ignora acentos e caixa. Itens
 * selecionados continuam marcados mesmo quando ocultos pelo filtro.
 */
export function MultiSelectCombo({
  options,
  selected,
  onChange,
  placeholder,
  pluralLabel,
  emptyText,
  searchPlaceholder = "Digite para filtrar…",
  className,
}: MultiSelectComboProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const comboRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const visible = useMemo(() => {
    const q = normalize(query);
    return q ? options.filter((o) => normalize(o.name).includes(q)) : options;
  }, [options, query]);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!comboRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  // Reabrir começa sempre com a lista completa.
  function setOpenAndReset(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  }

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.id === selected[0])?.name ?? pluralLabel(1))
        : pluralLabel(selected.length);

  return (
    <div
      ref={comboRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpenAndReset(false);
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpenAndReset(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        className={cn(
          className,
          "flex items-center justify-between gap-2 text-left",
          focusRing,
        )}
      >
        <span className={cn("truncate", selected.length === 0 && "text-soft")}>
          {label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-medium transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="absolute z-20 mt-1 w-full rounded-md border-2 border-ink bg-surface p-1 shadow-[4px_4px_0_0_var(--color-ink)]">
          <div className="relative mb-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-soft"
            />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Enter no campo de busca não deve submeter o formulário.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (visible.length === 1) toggle(visible[0].id);
                }
              }}
              placeholder={searchPlaceholder}
              aria-label="Filtrar opções"
              aria-controls={listId}
              className="h-8 w-full rounded border border-border bg-surface pl-7 pr-2 text-sm text-strong outline-none focus:border-ink"
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            className="max-h-64 overflow-auto"
          >
            {visible.length === 0 ? (
              <p className="px-2 py-2 text-xs text-soft">
                {options.length === 0 ? emptyText : "Nenhuma opção encontrada."}
              </p>
            ) : (
              visible.map((o) => {
                const checked = selected.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggle(o.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-strong hover:bg-surface-muted"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded border-2 border-ink",
                        checked ? "bg-brand-fill text-white" : "bg-surface",
                      )}
                    >
                      {checked ? (
                        <Check aria-hidden="true" className="size-3" />
                      ) : null}
                    </span>
                    <span className="truncate">{o.name}</span>
                  </button>
                );
              })
            )}
          </div>
          {selected.length > 0 ? (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-medium text-medium hover:bg-surface-muted"
            >
              <X aria-hidden="true" className="size-3.5" />
              Limpar seleção
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
