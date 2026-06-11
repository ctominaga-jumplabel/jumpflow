import { SectionPanel } from "@/components/ui/SectionPanel";
import { ActionButton } from "@/components/ui/ActionButton";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { EXPENSE_STATUSES, expenseStatusLabels } from "@/lib/expenses/types";
import {
  activityLabels,
  ACTIVITY_TYPES,
  timeEntryStatusLabels,
} from "@/lib/timesheet/types";
import { EXPENSE_STAGES } from "@/lib/reports/schemas";
import type { ReportFilterOptions } from "@/lib/db/reports";

const stageLabels: Record<(typeof EXPENSE_STAGES)[number], string> = {
  GESTOR: "Gestor",
  FINANCEIRO: "Financeiro",
  PAGAMENTO: "Pagamento",
  FINALIZADA: "Finalizada",
};

const hoursStatusOrder = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "REJECTED",
  "CLOSED",
] as const;

const fieldClass = cn(
  "h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-strong",
  focusRing,
);

const labelClass = "mb-1 block text-xs font-semibold text-soft";

export interface ReportFiltersProps {
  tab: "horas" | "despesas" | "consolidado";
  options: ReportFilterOptions;
  /** Current raw query params (reflected in the form fields). */
  values: Record<string, string>;
}

/**
 * Filter form for the reports. A plain GET form to `/app/relatorios` — the
 * server reads `searchParams`, so filters live entirely in the query string
 * (server-driven, no client state). The hidden `tab` keeps the active segment.
 */
export function ReportFilters({ tab, options, values }: ReportFiltersProps) {
  const v = (key: string) => values[key] ?? "";

  return (
    <SectionPanel
      title="Filtros"
      description="Período, cliente, projeto e mais. Os filtros valem para a tela e para o CSV."
    >
      <form method="get" action="/app/relatorios" className="px-5 py-4">
        <input type="hidden" name="tab" value={tab} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tab === "consolidado" ? (
            <div>
              <label className={labelClass} htmlFor="f-month">
                Mês (aaaa-mm)
              </label>
              <input
                id="f-month"
                name="month"
                type="month"
                defaultValue={v("month")}
                className={fieldClass}
              />
            </div>
          ) : null}

          <div>
            <label className={labelClass} htmlFor="f-from">
              De
            </label>
            <input
              id="f-from"
              name="from"
              type="date"
              defaultValue={v("from")}
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="f-to">
              Até
            </label>
            <input
              id="f-to"
              name="to"
              type="date"
              defaultValue={v("to")}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass} htmlFor="f-client">
              Cliente
            </label>
            <select
              id="f-client"
              name="clientId"
              defaultValue={v("clientId")}
              className={fieldClass}
            >
              <option value="">Todos</option>
              {options.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="f-project">
              Projeto
            </label>
            <select
              id="f-project"
              name="projectId"
              defaultValue={v("projectId")}
              className={fieldClass}
            >
              <option value="">Todos</option>
              {options.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {options.consultants.length > 1 ? (
            <div>
              <label className={labelClass} htmlFor="f-consultant">
                Consultor
              </label>
              <select
                id="f-consultant"
                name="consultantId"
                defaultValue={v("consultantId")}
                className={fieldClass}
              >
                <option value="">Todos</option>
                {options.consultants.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {tab === "horas" ? (
            <>
              <div>
                <label className={labelClass} htmlFor="f-status">
                  Status
                </label>
                <select
                  id="f-status"
                  name="status"
                  defaultValue={v("status")}
                  className={fieldClass}
                >
                  <option value="">Todos</option>
                  {hoursStatusOrder.map((s) => (
                    <option key={s} value={s}>
                      {timeEntryStatusLabels[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="f-activity">
                  Atividade
                </label>
                <select
                  id="f-activity"
                  name="activityType"
                  defaultValue={v("activityType")}
                  className={fieldClass}
                >
                  <option value="">Todas</option>
                  {ACTIVITY_TYPES.map((a) => (
                    <option key={a} value={a}>
                      {activityLabels[a]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}

          {tab === "despesas" ? (
            <>
              <div>
                <label className={labelClass} htmlFor="f-exp-status">
                  Status
                </label>
                <select
                  id="f-exp-status"
                  name="status"
                  defaultValue={v("status")}
                  className={fieldClass}
                >
                  <option value="">Todos</option>
                  {EXPENSE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {expenseStatusLabels[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="f-stage">
                  Etapa
                </label>
                <select
                  id="f-stage"
                  name="stage"
                  defaultValue={v("stage")}
                  className={fieldClass}
                >
                  <option value="">Todas</option>
                  {EXPENSE_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {stageLabels[s]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ActionButton type="submit" variant="primary" size="sm">
            Aplicar filtros
          </ActionButton>
          <a
            href={`/app/relatorios?tab=${tab}`}
            className={cn(
              "inline-flex h-8 items-center rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
              focusRing,
            )}
          >
            Limpar
          </a>
        </div>
      </form>
    </SectionPanel>
  );
}
