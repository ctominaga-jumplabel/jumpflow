"use client";

import { useMemo, useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { FilterChip } from "@/components/ui/FilterChip";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  consultants as allConsultants,
  distinctSkills,
  filterConsultants,
  seniorityLabels,
  type Consultant,
  type Seniority,
} from "@/lib/mock-data/consultants";
import { ConsultantAvailabilityBadge } from "./ConsultantAvailabilityBadge";
import { ConsultantSkillChips } from "./ConsultantSkillChips";

const SENIORITY_FILTERS: (Seniority | "ALL")[] = [
  "ALL",
  "JUNIOR",
  "PLENO",
  "SENIOR",
  "ESPECIALISTA",
];

export interface ConsultantDirectoryProps {
  consultants?: Consultant[];
}

/**
 * Searchable consultant directory. Search by name/title/area, filter by
 * seniority and skill. Dense card grid so each consultant reads as a unit.
 */
export function ConsultantDirectory({
  consultants = allConsultants,
}: ConsultantDirectoryProps) {
  const [search, setSearch] = useState("");
  const [seniority, setSeniority] = useState<Seniority | "ALL">("ALL");
  const [skillId, setSkillId] = useState<string>("ALL");

  const skillOptions = useMemo(
    () => distinctSkills(consultants),
    [consultants],
  );

  const rows = useMemo(
    () => filterConsultants(consultants, { search, seniority, skillId }),
    [consultants, search, seniority, skillId],
  );

  return (
    <div className="space-y-4">
      <DataToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar por nome, cargo ou área",
        }}
        filters={
          <>
            {SENIORITY_FILTERS.map((s) => (
              <FilterChip
                key={s}
                label={s === "ALL" ? "Todas" : seniorityLabels[s]}
                active={seniority === s}
                onClick={() => setSeniority(s)}
              />
            ))}
            <label className="sr-only" htmlFor="consultant-skill-filter">
              Filtrar por skill
            </label>
            <select
              id="consultant-skill-filter"
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              className={cn(
                "h-9 rounded-md border border-border bg-surface px-2 text-xs font-semibold text-medium",
                focusRingInput,
              )}
            >
              <option value="ALL">Todas as skills</option>
              {skillOptions.map((s) => (
                <option key={s.skillId} value={s.skillId}>
                  {s.name}
                </option>
              ))}
            </select>
          </>
        }
        actions={
          <ActionButton variant="primary" size="sm" icon={UserPlus}>
            Novo consultor
          </ActionButton>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum consultor encontrado"
          description="Ajuste a busca ou os filtros para encontrar outros perfis."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((consultant) => (
            <li
              key={consultant.id}
              className="rounded-[var(--radius-card)] border-2 border-ink bg-surface p-4 shadow-[4px_4px_0_0_var(--color-ink)]"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-strong">
                    {consultant.name}
                  </p>
                  <p className="truncate text-xs text-soft">
                    {consultant.jobTitle} · {consultant.area}
                  </p>
                </div>
                {consultant.status === "INACTIVE" ? (
                  <StatusBadge tone="neutral">Inativo</StatusBadge>
                ) : (
                  <StatusBadge tone="info">
                    {seniorityLabels[consultant.seniority]}
                  </StatusBadge>
                )}
              </div>

              <div className="mt-3">
                <ConsultantAvailabilityBadge
                  allocationPercent={consultant.allocationPercent}
                />
              </div>

              <div className="mt-3 border-t border-border pt-3">
                <ConsultantSkillChips skills={consultant.topSkills} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
