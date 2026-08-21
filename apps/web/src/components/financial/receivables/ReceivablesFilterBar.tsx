"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";

export interface ReceivablesFilterOption {
  id: string;
  name: string;
}
export interface ReceivablesProjectOption extends ReceivablesFilterOption {
  clientId: string;
}

export interface ReceivablesFilterBarProps {
  clients: ReceivablesFilterOption[];
  projects: ReceivablesProjectOption[];
  consultants: ReceivablesFilterOption[];
  values: {
    from?: string;
    to?: string;
    clientId?: string;
    projectIds: string[];
    consultantId?: string;
    /** "true" | "false" | undefined (Todos). */
    billable?: string;
  };
}

const fieldClass = cn(
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
  focusRingInput,
);

/**
 * Barra de filtros da aba Contas a Receber (mockup 02): Período (data
 * inicial/final), Cliente (select) e Projeto (multi-seleção via combo box
 * escopado ao cliente selecionado). Envia via GET para /app/financeiro
 * preservando `tab=receber`; cada projeto vira um `projectIds` repetido na
 * query (o `receivablesFilterSchema` aceita array). O Cliente é controlado em
 * estado porque filtra as opções de projeto em tempo real.
 */
export function ReceivablesFilterBar({
  clients,
  projects,
  consultants,
  values,
}: ReceivablesFilterBarProps) {
  const [clientId, setClientId] = useState(values.clientId ?? "");
  const [selected, setSelected] = useState<string[]>(values.projectIds);
  const [open, setOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  // Projetos escopados ao cliente selecionado (sem cliente, todos).
  const availableProjects = useMemo(
    () =>
      clientId ? projects.filter((p) => p.clientId === clientId) : projects,
    [projects, clientId],
  );

  // Ao trocar de cliente, descarta projetos selecionados fora do novo escopo.
  useEffect(() => {
    setSelected((prev) =>
      prev.filter((id) => availableProjects.some((p) => p.id === id)),
    );
  }, [availableProjects]);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    if (!open) return;
    function onClick(event: MouseEvent) {
      if (!comboRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function toggleProject(id: string) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const selectedLabel =
    selected.length === 0
      ? "Todos os projetos"
      : selected.length === 1
        ? (availableProjects.find((p) => p.id === selected[0])?.name ??
          "1 projeto")
        : `${selected.length} projetos selecionados`;

  return (
    <form
      method="get"
      action="/app/financeiro"
      className="grid items-end gap-3 rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)] sm:grid-cols-2 lg:grid-cols-3"
    >
      {/* Mantém a aba ativa ao filtrar via GET. */}
      <input type="hidden" name="tab" value="receber" />
      {/* Projetos selecionados como params repetidos (array no schema). */}
      {selected.map((id) => (
        <input key={id} type="hidden" name="projectIds" value={id} />
      ))}

      <div className="min-w-0">
        <span className="text-xs font-semibold text-medium">Período</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="date"
            name="from"
            defaultValue={values.from ?? ""}
            aria-label="Data inicial"
            className={fieldClass}
          />
          <span className="text-xs text-soft">até</span>
          <input
            type="date"
            name="to"
            defaultValue={values.to ?? ""}
            aria-label="Data final"
            className={fieldClass}
          />
        </div>
      </div>

      <label className="min-w-0">
        <span className="text-xs font-semibold text-medium">Cliente</span>
        <select
          name="clientId"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          className={cn(fieldClass, "mt-1")}
        >
          <option value="">Todos os clientes</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div ref={comboRef} className="relative min-w-0">
        <span className="text-xs font-semibold text-medium">Projeto</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            fieldClass,
            "mt-1 flex items-center justify-between gap-2 text-left",
            focusRing,
          )}
        >
          <span
            className={cn("truncate", selected.length === 0 && "text-soft")}
          >
            {selectedLabel}
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
          <div
            role="listbox"
            aria-multiselectable="true"
            className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border-2 border-ink bg-surface p-1 shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            {availableProjects.length === 0 ? (
              <p className="px-2 py-2 text-xs text-soft">
                Nenhum projeto disponível para o cliente.
              </p>
            ) : (
              availableProjects.map((p) => {
                const checked = selected.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="option"
                    aria-selected={checked}
                    onClick={() => toggleProject(p.id)}
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
                    <span className="truncate">{p.name}</span>
                  </button>
                );
              })
            )}
            {selected.length > 0 ? (
              <button
                type="button"
                onClick={() => setSelected([])}
                className="mt-1 flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-xs font-medium text-medium hover:bg-surface-muted"
              >
                <X aria-hidden="true" className="size-3.5" />
                Limpar seleção
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <label className="min-w-0">
        <span className="text-xs font-semibold text-medium">Colaborador</span>
        <select
          name="consultantId"
          defaultValue={values.consultantId ?? ""}
          className={cn(fieldClass, "mt-1")}
        >
          <option value="">Todos os colaboradores</option>
          {consultants.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="min-w-0">
        <span className="text-xs font-semibold text-medium">Faturar</span>
        <select
          name="billable"
          defaultValue={values.billable ?? ""}
          className={cn(fieldClass, "mt-1")}
        >
          <option value="">Todos</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </select>
      </label>

      <div className="flex items-end sm:col-span-2 lg:col-span-1">
        <button
          type="submit"
          className={cn(
            "inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border-2 border-ink bg-brand-fill px-5 text-sm font-semibold text-white shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]",
            focusRing,
          )}
        >
          <Search aria-hidden="true" className="size-4" />
          Pesquisar
        </button>
      </div>
    </form>
  );
}
