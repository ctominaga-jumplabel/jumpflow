"use client";

import { useMemo, useState } from "react";
import { Download, Users } from "lucide-react";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { aggregateTeamGap, filterMatrixByType } from "@/lib/competencies/gap";
import {
  skillLevelLabels,
  skillTypeLabels,
  type CompetencyMatrix,
  type GapStatus,
  type MatrixCell,
  type SkillType,
  type TeamGapRow,
} from "@/lib/competencies/types";

type TypeFilter = "ALL" | SkillType;
type ViewMode = "MATRIX" | "TEAM";

const cellTone: Record<GapStatus, string> = {
  GAP: "bg-danger-soft text-danger",
  MEETS: "bg-success-soft text-success",
  NOT_ASSESSED: "bg-surface-muted text-soft",
  NO_PROFILE: "bg-surface-muted text-soft",
};

function cellText(cell: MatrixCell): string {
  switch (cell.status) {
    case "NO_PROFILE":
      return "—";
    case "NOT_ASSESSED":
      return cell.requiredLevel ? `Req. ${shortLevel(cell.requiredLevel)}` : "—";
    case "GAP":
    case "MEETS":
      if (cell.currentLevel === null) return "—";
      return shortLevel(cell.currentLevel);
  }
}

function shortLevel(level: keyof typeof skillLevelLabels): string {
  return skillLevelLabels[level].slice(0, 3);
}

function cellTitle(cell: MatrixCell, skillName: string): string {
  const req = cell.requiredLevel
    ? skillLevelLabels[cell.requiredLevel]
    : "não definido";
  const cur = cell.currentLevel
    ? skillLevelLabels[cell.currentLevel]
    : "não avaliado";
  return `${skillName} — requerido: ${req}, atual: ${cur}`;
}

export interface CompetencyGapMatrixProps {
  matrix: CompetencyMatrix;
  teamGap: TeamGapRow[];
}

/**
 * Matriz requerido × atual com gap por consultor (EP14 US14.01/02) e visão
 * agregada por time (US14.03). Filtro técnica/comportamental e export CSV (via
 * route handler que recomputa o escopo RBAC). A filtragem por tipo é local; o
 * gap já vem calculado do servidor (read-model).
 */
export function CompetencyGapMatrix({
  matrix,
  teamGap,
}: CompetencyGapMatrixProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [view, setView] = useState<ViewMode>("MATRIX");

  const filteredMatrix = useMemo(
    () => filterMatrixByType(matrix, typeFilter),
    [matrix, typeFilter],
  );
  const filteredTeam = useMemo(
    () =>
      typeFilter === "ALL"
        ? teamGap
        : aggregateTeamGap(filteredMatrix.consultants, filteredMatrix.skills),
    [teamGap, typeFilter, filteredMatrix],
  );

  const csvHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("view", view === "TEAM" ? "team" : "matrix");
    if (typeFilter !== "ALL") params.set("type", typeFilter);
    return `/api/competencias/gap?${params.toString()}`;
  }, [view, typeFilter]);

  const hasData =
    filteredMatrix.consultants.length > 0 && filteredMatrix.skills.length > 0;

  return (
    <div className="space-y-4">
      <DataToolbar
        filters={
          <>
            <FilterChip
              label="Todos os tipos"
              active={typeFilter === "ALL"}
              onClick={() => setTypeFilter("ALL")}
            />
            <FilterChip
              label={skillTypeLabels.TECHNICAL}
              active={typeFilter === "TECHNICAL"}
              onClick={() => setTypeFilter("TECHNICAL")}
            />
            <FilterChip
              label={skillTypeLabels.BEHAVIORAL}
              active={typeFilter === "BEHAVIORAL"}
              onClick={() => setTypeFilter("BEHAVIORAL")}
            />
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <FilterChip
              label="Por consultor"
              active={view === "MATRIX"}
              onClick={() => setView("MATRIX")}
            />
            <FilterChip
              label="Por time"
              active={view === "TEAM"}
              onClick={() => setView("TEAM")}
            />
          </>
        }
        actions={
          <a
            href={csvHref}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
              focusRing,
            )}
          >
            <Download aria-hidden="true" className="size-4" />
            Exportar CSV
          </a>
        }
      />

      <ul className="flex flex-wrap items-center gap-3 text-xs text-soft">
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-danger-soft ring-1 ring-danger/30" />
          Lacuna (atual &lt; requerido)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-success-soft ring-1 ring-success/30" />
          Atende
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-surface-muted ring-1 ring-ink/15" />
          Não avaliada / sem perfil
        </li>
      </ul>

      {view === "TEAM" ? (
        <SectionPanel
          title="Gap por time"
          description="Skills com maior lacuna média e mais consultores abaixo do requerido"
        >
          {filteredTeam.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={Users}
                title="Sem gap a exibir"
                description="Não há skills avaliadas com nível requerido no escopo atual."
              />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filteredTeam.map((row) => (
                <li
                  key={row.skillId}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-strong">
                      {row.skillName}
                    </p>
                    <p className="text-xs text-soft">
                      {skillTypeLabels[row.skillType]} · {row.assessedCount}{" "}
                      avaliados
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-soft tabular-nums">
                      gap médio {row.averageGap.toFixed(2)}
                    </span>
                    <StatusBadge tone={row.belowCount > 0 ? "warning" : "success"}>
                      {row.belowCount} abaixo
                    </StatusBadge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionPanel>
      ) : (
        <SectionPanel
          title="Matriz requerido × atual"
          description={`${filteredMatrix.consultants.length} consultores · ${filteredMatrix.skills.length} skills`}
        >
          {!hasData ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={Users}
                title="Sem dados para a matriz"
                description="Não há consultores no seu escopo ou nenhuma skill relevante (perfil/declarada)."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Matriz de competências requerido versus atual por consultor
                </caption>
                <thead>
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="sticky left-0 z-10 bg-surface px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft"
                    >
                      Consultor
                    </th>
                    {filteredMatrix.skills.map((col) => (
                      <th
                        key={col.skillId}
                        scope="col"
                        className="px-2 py-3 text-center text-xs font-semibold text-soft"
                        title={col.skillName}
                      >
                        <span className="block max-w-[6rem] truncate">
                          {col.skillName}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredMatrix.consultants.map((row) => (
                    <tr key={row.consultantId}>
                      <th
                        scope="row"
                        className="sticky left-0 z-10 bg-surface px-4 py-2.5 text-left"
                      >
                        <span className="block truncate text-sm font-medium text-strong">
                          {row.consultantName}
                        </span>
                        <span className="block truncate text-xs text-soft">
                          {row.profileName ?? "Sem perfil aplicável"}
                        </span>
                      </th>
                      {row.cells.map((cell) => (
                        <td
                          key={cell.skillId}
                          className="px-2 py-2.5 text-center"
                        >
                          <span
                            title={cellTitle(
                              cell,
                              filteredMatrix.skills.find(
                                (s) => s.skillId === cell.skillId,
                              )?.skillName ?? "",
                            )}
                            className={cn(
                              "inline-flex min-w-[2.75rem] items-center justify-center rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
                              cellTone[cell.status],
                            )}
                          >
                            {cellText(cell)}
                          </span>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionPanel>
      )}
    </div>
  );
}
