import type { ProjectItem } from "@/lib/projects/types";
import { formatDate } from "@/lib/format";
import { ProjectStatusBadge } from "../ProjectStatusBadge";

/**
 * Read-only context owned by Operação (cliente, status, período, gestor),
 * shown on the Comercial and Financeiro surfaces so nobody works in the dark.
 * Optionally renders an extra slot (e.g. valor de venda for margem no
 * Financeiro). Purely presentational — never editable here.
 */
export function ProjectContextCard({
  project,
  extra,
}: {
  project: ProjectItem;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-surface-muted p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-strong">{project.name}</p>
          <p className="text-xs text-soft">{project.clientName}</p>
        </div>
        <ProjectStatusBadge status={project.status} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-soft">Período</dt>
          <dd className="tabular-nums text-medium">
            {formatDate(project.startDate)} -{" "}
            {project.endDate ? formatDate(project.endDate) : "em aberto"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-soft">Gestor</dt>
          <dd className="text-medium">{project.managerName ?? "-"}</dd>
        </div>
      </dl>
      {extra ? <div className="mt-2">{extra}</div> : null}
    </div>
  );
}
