"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { MultiSelectCombo } from "@/components/ui/MultiSelectCombo";

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
        <SearchableSelect
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
        </SearchableSelect>
      </label>

      <div className="min-w-0">
        <span className="text-xs font-semibold text-medium">Projeto</span>
        <MultiSelectCombo
          options={availableProjects}
          selected={selected}
          onChange={setSelected}
          placeholder="Todos os projetos"
          pluralLabel={(n) =>
            n === 1 ? "1 projeto" : `${n} projetos selecionados`
          }
          emptyText="Nenhum projeto disponível para o cliente."
          searchPlaceholder="Digite para filtrar projetos…"
          className={cn(fieldClass, "mt-1")}
        />
      </div>

      <label className="min-w-0">
        <span className="text-xs font-semibold text-medium">Colaborador</span>
        <SearchableSelect
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
        </SearchableSelect>
      </label>

      <label className="min-w-0">
        <span className="text-xs font-semibold text-medium">Faturar</span>
        <SearchableSelect
          name="billable"
          defaultValue={values.billable ?? ""}
          className={cn(fieldClass, "mt-1")}
        >
          <option value="">Todos</option>
          <option value="true">Sim</option>
          <option value="false">Não</option>
        </SearchableSelect>
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
