"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  budgetConsumption,
  clients,
  filterProjects,
  projects as allProjects,
  projectStatusLabels,
  type Project,
  type ProjectStatus,
} from "@/lib/mock-data/projects";
import {
  formatCurrencyPrecise,
  formatDate,
  formatHours,
  MASKED_VALUE,
} from "@/lib/format";
import { FolderKanban } from "lucide-react";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

const STATUS_FILTERS: (ProjectStatus | "ALL")[] = [
  "ALL",
  "ACTIVE",
  "PLANNED",
  "ON_HOLD",
  "CLOSED",
];

export interface ProjectListProps {
  /** Whether the current role may see financial fields (rate/budget). */
  canViewFinancials: boolean;
  projects?: Project[];
}

/**
 * Filterable project list. Search by project/client, filter by status and
 * client. Financial columns (valor hora, budget) are masked unless the caller
 * grants `canViewFinancials` (resolved server-side by the page).
 */
export function ProjectList({
  canViewFinancials,
  projects = allProjects,
}: ProjectListProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ProjectStatus | "ALL">("ALL");
  const [clientId, setClientId] = useState<string>("ALL");

  const rows = useMemo(
    () => filterProjects(projects, { search, status, clientId }),
    [projects, search, status, clientId],
  );

  const columns: DataTableColumn<Project>[] = [
    {
      key: "project",
      header: "Projeto",
      cell: (p) => (
        <div>
          <p className="font-medium text-strong">{p.name}</p>
          <p className="text-xs text-soft">{p.client.name}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (p) => <ProjectStatusBadge status={p.status} />,
    },
    {
      key: "manager",
      header: "Gestor",
      cell: (p) => <span className="text-sm">{p.managerName}</span>,
      className: "hidden md:table-cell",
    },
    {
      key: "period",
      header: "Período",
      cell: (p) => (
        <span className="text-sm tabular-nums text-medium">
          {formatDate(p.startDate)} –{" "}
          {p.endDate ? formatDate(p.endDate) : "em aberto"}
        </span>
      ),
      className: "hidden lg:table-cell",
    },
    {
      key: "rate",
      header: "Valor hora",
      align: "right",
      cell: (p) => (
        <span className="text-sm tabular-nums">
          {canViewFinancials
            ? formatCurrencyPrecise(p.billingHourlyRate)
            : MASKED_VALUE}
        </span>
      ),
    },
    {
      key: "budget",
      header: canViewFinancials ? "Budget" : "Consumo",
      cell: (p) => {
        const pct = budgetConsumption(p);
        return (
          <div className="min-w-[120px]">
            <div className="flex items-center justify-between text-xs">
              <span className="tabular-nums text-medium">
                {canViewFinancials
                  ? `${formatHours(p.consumedHours)} / ${formatHours(p.budgetHours)}`
                  : formatHours(p.consumedHours)}
              </span>
              {canViewFinancials ? (
                <span
                  className={cn(
                    "tabular-nums font-medium",
                    pct > 100 ? "text-danger" : "text-soft",
                  )}
                >
                  {pct}%
                </span>
              ) : null}
            </div>
            {canViewFinancials ? (
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    pct > 100 ? "bg-danger" : "bg-brand",
                  )}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "team",
      header: "Equipe",
      align: "right",
      cell: (p) => (
        <span className="text-sm tabular-nums text-medium">
          {p.allocatedConsultants}
        </span>
      ),
      className: "hidden sm:table-cell",
    },
  ];

  return (
    <div className="space-y-4">
      <DataToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar projeto ou cliente",
        }}
        filters={
          <>
            {STATUS_FILTERS.map((s) => (
              <FilterChip
                key={s}
                label={s === "ALL" ? "Todos" : projectStatusLabels[s]}
                active={status === s}
                onClick={() => setStatus(s)}
              />
            ))}
            <label className="sr-only" htmlFor="project-client-filter">
              Filtrar por cliente
            </label>
            <select
              id="project-client-filter"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className={cn(
                "h-9 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-medium",
                focusRingInput,
              )}
            >
              <option value="ALL">Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        }
        actions={
          <ActionButton variant="primary" size="sm" icon={Plus}>
            Novo projeto
          </ActionButton>
        }
      />

      <SectionPanel
        title="Projetos"
        description={`${rows.length} ${rows.length === 1 ? "projeto" : "projetos"}`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          caption="Lista de projetos"
          empty={
            <EmptyState
              icon={FolderKanban}
              title="Nenhum projeto encontrado"
              description="Ajuste a busca ou os filtros para ver outros projetos."
            />
          }
        />
      </SectionPanel>
    </div>
  );
}
