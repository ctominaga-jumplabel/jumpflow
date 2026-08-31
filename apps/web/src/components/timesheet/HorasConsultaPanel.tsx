"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { ActionButton } from "@/components/ui/ActionButton";
import { ExportExcelButton } from "@/components/ui/ExportExcelButton";
import { HoursReportTable } from "@/components/reports/HoursReportTable";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { timeEntryStatusLabels } from "@/lib/timesheet/types";
import { pageSizeOptionsWith } from "@/lib/reports/schemas";
import type { ReportFilterOptions } from "@/lib/db/reports";
import type { HoursReport } from "@/lib/reports/types";

const fieldClass = cn(
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
  focusRing,
);
const labelClass = "mb-1 block text-xs font-semibold text-medium";

/**
 * Filter params shared with the Relatorios hours read/export. `semana` is
 * preserved as a passthrough so a manager who is ALSO a consultant does not
 * lose the weekly editor's selected week when applying a consultation filter.
 */
const FILTER_KEYS = [
  "from",
  "to",
  "clientId",
  "projectId",
  "consultantId",
  "status",
] as const;

const STATUS_ORDER = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;

export interface HorasConsultaPanelProps {
  /** RBAC-scoped hours report (current page). */
  report: HoursReport;
  /** Scoped dropdown options (clients/projects/consultants + allocation graph). */
  options: ReportFilterOptions;
  /** Current raw query params (reflected in the form fields and links). */
  values: Record<string, string>;
}

/** Seleção corrente dos três filtros conjuntos (cliente/projeto/consultor). */
interface LinkedSelection {
  clientId: string;
  projectId: string;
  consultantId: string;
}

/**
 * Read-only multi-consultant hours consultation for managers on the Horas
 * screen. Reuses the Relatorios pipeline end-to-end: the rows come from
 * `getHoursReport` (RBAC + financial masking on the server) and the table is
 * the same `HoursReportTable`. Query string is the source of truth.
 *
 * FILTROS CONJUNTOS (client-side): Cliente, Projeto e Consultor se restringem
 * mutuamente NA SELEÇÃO (sem submit) — escolher um projeto deixa no seletor de
 * consultor apenas quem está nele; escolher um consultor deixa em Projeto apenas
 * onde ele está alocado; Cliente afunila os dois. As LINHAS de lançamento só são
 * refiltradas ao clicar em "Aplicar filtros" (o form faz um GET e o servidor
 * reconsulta). O grafo (options.allocations) mora no cliente para a cascata.
 */
export function HorasConsultaPanel({
  report,
  options,
  values,
}: HorasConsultaPanelProps) {
  const v = (key: string) => values[key] ?? "";

  // Estado local dos três filtros conjuntos (semente = filtros já aplicados).
  const [sel, setSel] = useState<LinkedSelection>({
    clientId: v("clientId"),
    projectId: v("projectId"),
    consultantId: v("consultantId"),
  });

  // Índices do grafo de alocação para a cascata (memoizados).
  const graph = useMemo(() => {
    /** Adiciona `value` ao conjunto de `key` (criando-o na primeira vez). */
    const add = (map: Map<string, Set<string>>, key: string, value: string) => {
      let set = map.get(key);
      if (!set) {
        set = new Set();
        map.set(key, set);
      }
      set.add(value);
    };
    const projectsByConsultant = new Map<string, Set<string>>();
    const consultantsByProject = new Map<string, Set<string>>();
    const clientByProject = new Map<string, string>();
    for (const p of options.projects) clientByProject.set(p.id, p.clientId);
    // Consultores por cliente (via o projeto de cada alocação).
    const consultantsByClient = new Map<string, Set<string>>();
    for (const a of options.allocations) {
      add(projectsByConsultant, a.consultantId, a.projectId);
      add(consultantsByProject, a.projectId, a.consultantId);
      const clientId = clientByProject.get(a.projectId);
      if (clientId) add(consultantsByClient, clientId, a.consultantId);
    }
    return {
      projectsByConsultant,
      consultantsByProject,
      clientByProject,
      consultantsByClient,
    };
  }, [options.allocations, options.projects]);

  /** Consultores que têm ao menos um projeto do cliente informado. */
  const consultantsInClient = graph.consultantsByClient;

  // Listas disponíveis: cada seletor é afunilado pelos OUTROS dois filtros.
  const availableProjects = useMemo(() => {
    return options.projects.filter(
      (p) =>
        (!sel.clientId || p.clientId === sel.clientId) &&
        (!sel.consultantId ||
          graph.projectsByConsultant.get(sel.consultantId)?.has(p.id)),
    );
  }, [options.projects, sel.clientId, sel.consultantId, graph]);

  const availableConsultants = useMemo(() => {
    return options.consultants.filter(
      (c) =>
        (!sel.projectId ||
          graph.consultantsByProject.get(sel.projectId)?.has(c.id)) &&
        (!sel.clientId || consultantsInClient.get(sel.clientId)?.has(c.id)),
    );
  }, [
    options.consultants,
    sel.projectId,
    sel.clientId,
    graph,
    consultantsInClient,
  ]);

  const availableClients = useMemo(() => {
    return options.clients.filter((cl) => {
      if (sel.projectId) {
        return graph.clientByProject.get(sel.projectId) === cl.id;
      }
      if (sel.consultantId) {
        return consultantsInClient.get(cl.id)?.has(sel.consultantId) ?? false;
      }
      return true;
    });
  }, [options.clients, sel.projectId, sel.consultantId, graph, consultantsInClient]);

  /**
   * Reconcilia a seleção após uma mudança: se um valor selecionado deixou de
   * estar disponível (por causa do filtro que acabou de mudar), é limpo. Como o
   * usuário mexe em UM campo por vez e limpar só ALARGA as listas, uma passada
   * basta para nunca restar uma seleção inválida.
   */
  function applyChange(next: LinkedSelection): void {
    const projectOk =
      !next.projectId ||
      ((!next.clientId ||
        graph.clientByProject.get(next.projectId) === next.clientId) &&
        (!next.consultantId ||
          (graph.projectsByConsultant
            .get(next.consultantId)
            ?.has(next.projectId) ??
            false)));
    const reconciled: LinkedSelection = {
      ...next,
      projectId: projectOk ? next.projectId : "",
    };
    const consultantOk =
      !reconciled.consultantId ||
      ((!reconciled.projectId ||
        (graph.consultantsByProject
          .get(reconciled.projectId)
          ?.has(reconciled.consultantId) ??
          false)) &&
        (!reconciled.clientId ||
          (consultantsInClient
            .get(reconciled.clientId)
            ?.has(reconciled.consultantId) ??
            false)));
    if (!consultantOk) reconciled.consultantId = "";
    const clientOk =
      !reconciled.clientId ||
      (!reconciled.projectId ||
        graph.clientByProject.get(reconciled.projectId) === reconciled.clientId);
    if (!clientOk) reconciled.clientId = "";
    setSel(reconciled);
  }

  /** Build a `/app/horas` href for a page, preserving filters + pageSize. */
  function pageHref(page: number): string {
    const search = new URLSearchParams();
    if (values.semana) search.set("semana", values.semana);
    for (const key of FILTER_KEYS) {
      const value = values[key];
      if (value && value !== "ALL") search.set(key, value);
    }
    if (values.pageSize) search.set("pageSize", values.pageSize);
    search.set("page", String(page));
    return `/app/horas?${search.toString()}`;
  }

  /** Filter params for the whole filtered set (no page/pageSize). */
  function exportSearch(): string {
    const search = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = values[key];
      if (value && value !== "ALL") search.set(key, value);
    }
    return search.toString();
  }

  /** CSV of the whole filtered set. */
  function csvHref(): string {
    const qs = exportSearch();
    return `/api/relatorios/horas${qs ? `?${qs}` : ""}`;
  }

  /** Same filter as the CSV, but the `.xlsx` route (Onda 6). */
  function xlsxHref(): string {
    const qs = exportSearch();
    return `/api/relatorios/horas/xlsx${qs ? `?${qs}` : ""}`;
  }

  return (
    <SectionPanel
      title="Consultar lançamentos"
      description="Visualização somente leitura de horas por cliente e consultor, no escopo do seu acesso. Cliente, Projeto e Consultor se afunilam entre si — as linhas são refiltradas ao aplicar."
    >
      <div className="px-5 py-4">
        <form method="get" action="/app/horas">
          {/* Preserve the weekly editor's selected week for dual-role users. */}
          {values.semana ? (
            <input type="hidden" name="semana" value={values.semana} />
          ) : null}
          {/* A new filter submission always returns to the first page. */}
          <input type="hidden" name="page" value="1" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className={labelClass} htmlFor="hc-from">
                De
              </label>
              <input
                id="hc-from"
                name="from"
                type="date"
                defaultValue={v("from")}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="hc-to">
                Até
              </label>
              <input
                id="hc-to"
                name="to"
                type="date"
                defaultValue={v("to")}
                className={fieldClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-client">
                Cliente
              </label>
              <select
                id="hc-client"
                name="clientId"
                value={sel.clientId}
                onChange={(e) =>
                  applyChange({ ...sel, clientId: e.target.value })
                }
                className={fieldClass}
              >
                <option value="">Todos</option>
                {availableClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-consultant">
                Consultor
              </label>
              <select
                id="hc-consultant"
                name="consultantId"
                value={sel.consultantId}
                onChange={(e) =>
                  applyChange({ ...sel, consultantId: e.target.value })
                }
                className={fieldClass}
              >
                <option value="">Todos</option>
                {availableConsultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-project">
                Projeto
              </label>
              <select
                id="hc-project"
                name="projectId"
                value={sel.projectId}
                onChange={(e) =>
                  applyChange({ ...sel, projectId: e.target.value })
                }
                className={fieldClass}
              >
                <option value="">Todos</option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-status">
                Status
              </label>
              <select
                id="hc-status"
                name="status"
                defaultValue={v("status")}
                className={fieldClass}
              >
                <option value="">Todos</option>
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {timeEntryStatusLabels[s]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelClass} htmlFor="hc-page-size">
                Itens por página
              </label>
              <select
                id="hc-page-size"
                name="pageSize"
                defaultValue={v("pageSize")}
                className={fieldClass}
              >
                {pageSizeOptionsWith(v("pageSize")).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ActionButton type="submit" variant="primary" size="sm">
              Aplicar filtros
            </ActionButton>
            <a
              href="/app/horas"
              className={cn(
                "inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
                focusRing,
              )}
            >
              Limpar
            </a>
            <a
              href={csvHref()}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
                focusRing,
              )}
            >
              <Download aria-hidden="true" className="size-3.5" />
              Exportar CSV
            </a>
            <ExportExcelButton href={xlsxHref()} />
          </div>
        </form>
      </div>

      <div className="border-t border-border px-5 py-4">
        <HoursReportTable
          report={report}
          prevHref={pageHref(Math.max(1, report.pagination.page - 1))}
          nextHref={pageHref(report.pagination.page + 1)}
        />
      </div>
    </SectionPanel>
  );
}
