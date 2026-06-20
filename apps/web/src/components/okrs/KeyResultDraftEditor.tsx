"use client";

import { Trash2 } from "lucide-react";
import { autoSourceOptionsForScope } from "@/lib/okrs/auto-source";
import {
  keyResultMetricLabels,
  type KeyResultMetric,
  type ObjectiveScope,
} from "@/lib/okrs/types";
import { EnumSelect, TextField } from "./fields";

/** Rascunho de Key Result editável na UI antes de persistir. */
export interface KeyResultDraft {
  title: string;
  metricType: KeyResultMetric;
  startValue: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  autoSource: string;
}

export function emptyKeyResultDraft(): KeyResultDraft {
  return {
    title: "",
    metricType: "NUMBER",
    startValue: "0",
    targetValue: "",
    currentValue: "0",
    unit: "",
    autoSource: "",
  };
}

/**
 * Editor de UM rascunho de KR. Mostra o seletor de fonte operacional só com as
 * fontes APLICÁVEIS ao escopo do objetivo (consultor/projeto têm horas; área/
 * empresa não). BOOLEAN simplifica os campos: start/target 0 ou 1.
 */
export function KeyResultDraftEditor({
  draft,
  scope,
  onChange,
  onRemove,
}: {
  draft: KeyResultDraft;
  scope: ObjectiveScope;
  onChange: (patch: Partial<KeyResultDraft>) => void;
  onRemove: () => void;
}) {
  const sources = autoSourceOptionsForScope(scope);
  const sourceOptions: Record<string, string> = Object.fromEntries(
    sources.map((s) => [s.key, s.label]),
  );
  const isBoolean = draft.metricType === "BOOLEAN";

  return (
    <li className="space-y-3 rounded-md border border-border bg-surface-muted p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <TextField
            label="Título do Key Result"
            value={draft.title}
            placeholder="Ex.: Horas faturáveis no trimestre"
            onChange={(title) => onChange({ title })}
          />
        </div>
        <button
          type="button"
          aria-label="Remover Key Result"
          onClick={onRemove}
          className="mt-6 grid size-7 shrink-0 place-items-center rounded-md text-medium hover:bg-surface hover:text-danger"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <EnumSelect
          label="Métrica"
          value={draft.metricType}
          options={keyResultMetricLabels}
          onChange={(metricType) =>
            metricType ? onChange({ metricType }) : undefined
          }
        />
        <TextField
          label="Unidade"
          value={draft.unit}
          placeholder={isBoolean ? "(não usada)" : "h, %, R$…"}
          disabled={isBoolean}
          onChange={(unit) => onChange({ unit })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TextField
          label={isBoolean ? "Início (0/1)" : "Início"}
          type="number"
          step="any"
          value={draft.startValue}
          onChange={(startValue) => onChange({ startValue })}
        />
        <TextField
          label={isBoolean ? "Alvo (0/1)" : "Alvo"}
          type="number"
          step="any"
          value={draft.targetValue}
          onChange={(targetValue) => onChange({ targetValue })}
        />
        <TextField
          label={isBoolean ? "Atual (0/1)" : "Atual"}
          type="number"
          step="any"
          value={draft.currentValue}
          onChange={(currentValue) => onChange({ currentValue })}
        />
      </div>

      {sources.length > 0 ? (
        <EnumSelect
          label="Fonte operacional (auto-update)"
          value={draft.autoSource}
          includeEmpty
          emptyLabel="Manual (sem fonte)"
          options={sourceOptions}
          hint="KRs com fonte podem sincronizar o valor atual do dado operacional (horas aprovadas no período)."
          onChange={(autoSource) => onChange({ autoSource })}
        />
      ) : null}
    </li>
  );
}
