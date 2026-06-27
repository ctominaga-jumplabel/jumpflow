"use client";

import { useMemo, useState } from "react";
import { Headset, Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import type { CheckpointViewModel } from "@/lib/db/checkpoint";
import {
  checkpointTypeLabels,
  type CheckpointInsights,
  type CheckpointOption,
  type CheckpointType,
} from "@/lib/checkpoint/types";
import type { CheckpointFlags } from "@/lib/checkpoint/flags";
import { CheckpointCard } from "./CheckpointCard";
import { CheckpointComposer } from "./CheckpointComposer";

type TypeFilter = "ALL" | CheckpointType;

export interface CheckpointsViewProps {
  items: CheckpointViewModel[];
  insightsById: Record<string, CheckpointInsights>;
  canRegister: boolean;
  isManager: boolean;
  consultants: CheckpointOption[];
  projects: CheckpointOption[];
  flags: CheckpointFlags;
}

const EMPTY_INSIGHTS: CheckpointInsights = { opportunities: [], cases: [] };

/**
 * Orquestrador do módulo Checkpoint / 1-on-1 (FATIA 5). Filtros client-side
 * (subtraem do universo já escopado no servidor), timeline cronológica, detalhe
 * inline com painel de insights e composer (gated por `canRegister`). Escrita,
 * visibilidade e insights são enforced no servidor; a UI só reflete o papel.
 */
export function CheckpointsView({
  items,
  insightsById,
  canRegister,
  isManager,
  consultants,
  projects,
  flags,
}: CheckpointsViewProps) {
  const { feedback, notify } = useFeedback();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [open, setOpen] = useState(false);

  const subjectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (!seen.has(item.consultantId)) {
        seen.set(item.consultantId, item.consultantName);
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [items]);

  const rows = useMemo(() => {
    const subject = subjectFilter.trim();
    return items.filter((item) => {
      if (typeFilter !== "ALL" && item.type !== typeFilter) return false;
      if (subject && item.consultantId !== subject) return false;
      return true;
    });
  }, [items, typeFilter, subjectFilter]);

  return (
    <div className="space-y-5">
      <FeedbackBanner message={feedback} />

      <DataToolbar
        filters={
          <>
            <FilterChip
              label="Todos os tipos"
              active={typeFilter === "ALL"}
              onClick={() => setTypeFilter("ALL")}
            />
            {(Object.keys(checkpointTypeLabels) as CheckpointType[]).map((t) => (
              <FilterChip
                key={t}
                label={checkpointTypeLabels[t]}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
              />
            ))}
          </>
        }
        actions={
          canRegister ? (
            <ActionButton icon={Plus} onClick={() => setOpen(true)}>
              Novo checkpoint
            </ActionButton>
          ) : null
        }
      />

      {subjectOptions.length > 1 ? (
        <label className="flex flex-wrap items-center gap-2 text-sm font-medium text-medium">
          Consultor
          <select
            value={subjectFilter}
            onChange={(event) => setSubjectFilter(event.target.value)}
            className="h-9 rounded-md border border-border bg-surface px-3 text-sm"
          >
            <option value="">Todos</option>
            {subjectOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <SectionPanel
        title="Timeline de checkpoints"
        description={`${rows.length} ${
          rows.length === 1 ? "registro visível" : "registros visíveis"
        } no filtro atual${
          isManager
            ? ""
            : " (apenas os compartilhados com você, sem transcrição ou insights crus)"
        }`}
      >
        {rows.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={Headset}
              title="Nenhum checkpoint no filtro"
              description={
                canRegister
                  ? "Ajuste os filtros ou registre o primeiro checkpoint do time."
                  : "Quando houver checkpoints compartilhados com você, eles aparecem aqui."
              }
            />
          </div>
        ) : (
          <ol className="divide-y divide-border">
            {rows.map((item) => (
              <CheckpointCard
                key={item.id}
                item={item}
                insights={insightsById[item.id] ?? EMPTY_INSIGHTS}
                flags={flags}
                notify={notify}
              />
            ))}
          </ol>
        )}
      </SectionPanel>

      {canRegister ? (
        <CheckpointComposer
          open={open}
          onClose={() => setOpen(false)}
          consultants={consultants}
          projects={projects}
          flags={flags}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
