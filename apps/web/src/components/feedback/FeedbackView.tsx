"use client";

import { useMemo, useState } from "react";
import { MessageSquareHeart, Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import {
  feedbackSourceLabels,
  feedbackTypeLabels,
  type ClientOption,
  type ConsultantOption,
  type FeedbackItem,
  type FeedbackSource,
  type FeedbackType,
  type ProjectOption,
} from "@/lib/feedback/types";
import type { FeedbackFlags } from "@/lib/feedback/flags";
import { FeedbackTimeline } from "./FeedbackTimeline";
import { FeedbackFormModal } from "./FeedbackFormModal";

type TypeFilter = "ALL" | FeedbackType;
type SourceFilter = "ALL" | FeedbackSource;

export interface FeedbackViewProps {
  items: FeedbackItem[];
  canWrite: boolean;
  isManager: boolean;
  consultants: ConsultantOption[];
  projects: ProjectOption[];
  clients: ClientOption[];
  flags: FeedbackFlags;
}

/**
 * Orchestrator do módulo de Feedback Contínuo (EP15). Filtros client-side
 * (subtraem do universo já escopado no servidor), timeline cronológica e
 * formulário de criação (gated por `canWrite`). A escrita e a visibilidade são
 * enforced no servidor; aqui a UI apenas reflete o que o papel permite.
 */
export function FeedbackView({
  items,
  canWrite,
  isManager,
  consultants,
  projects,
  clients,
  flags,
}: FeedbackViewProps) {
  const { feedback, notify } = useFeedback();
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("ALL");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [open, setOpen] = useState(false);

  const subjectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of items) {
      if (!seen.has(item.subjectConsultantId)) {
        seen.set(item.subjectConsultantId, item.subjectConsultantName);
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
      if (sourceFilter !== "ALL" && item.source !== sourceFilter) return false;
      if (subject && item.subjectConsultantId !== subject) return false;
      return true;
    });
  }, [items, typeFilter, sourceFilter, subjectFilter]);

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
            {(Object.keys(feedbackTypeLabels) as FeedbackType[]).map((t) => (
              <FilterChip
                key={t}
                label={feedbackTypeLabels[t]}
                active={typeFilter === t}
                onClick={() => setTypeFilter(t)}
              />
            ))}
            <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
            <FilterChip
              label="Todas as origens"
              active={sourceFilter === "ALL"}
              onClick={() => setSourceFilter("ALL")}
            />
            {(Object.keys(feedbackSourceLabels) as FeedbackSource[]).map((s) => (
              <FilterChip
                key={s}
                label={feedbackSourceLabels[s]}
                active={sourceFilter === s}
                onClick={() => setSourceFilter(s)}
              />
            ))}
          </>
        }
        actions={
          canWrite ? (
            <ActionButton icon={Plus} onClick={() => setOpen(true)}>
              Novo feedback
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
        title="Timeline de feedbacks"
        description={`${rows.length} ${rows.length === 1 ? "registro visível" : "registros visíveis"} no filtro atual${
          isManager ? "" : " (apenas os compartilhados com você e os que você escreveu)"
        }`}
      >
        {rows.length === 0 ? (
          <div className="px-5 py-10">
            <EmptyState
              icon={MessageSquareHeart}
              title="Nenhum feedback no filtro"
              description={
                canWrite
                  ? "Ajuste os filtros ou registre o primeiro feedback do time."
                  : "Quando houver feedbacks compartilhados com você, eles aparecem aqui."
              }
            />
          </div>
        ) : (
          <FeedbackTimeline items={rows} notify={notify} />
        )}
      </SectionPanel>

      {canWrite ? (
        <FeedbackFormModal
          open={open}
          onClose={() => setOpen(false)}
          consultants={consultants}
          projects={projects}
          clients={clients}
          flags={flags}
          notify={notify}
        />
      ) : null}
    </div>
  );
}
