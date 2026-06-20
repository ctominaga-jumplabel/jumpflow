"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { skillLevelLabels } from "@/lib/competencies/types";
import type { FitResult } from "@/lib/allocation-ai/types";
import {
  explainAllocationSuggestion,
  type ExplainAllocationResult,
} from "@/app/app/alocacao-ia/actions";

export interface CandidateCardProps {
  result: FitResult;
  rank: number;
  availabilityTone: StatusTone;
  availabilityLabel: string;
  aiEnabled: boolean;
  aiProviderReady: boolean;
}

function scoreTone(score: number): StatusTone {
  if (score >= 75) return "success";
  if (score >= 50) return "info";
  if (score >= 30) return "warning";
  return "danger";
}

/**
 * Cartão de um candidato no ranking da IA de Alocação (§8.2). Mostra o score e o
 * BREAKDOWN transparente por fator (peso, aderência, contribuição), o detalhe por
 * skill exigida e a disponibilidade. O botão "Explicar com IA" só renderiza com a
 * flag ligada; chama a server action que verbaliza os fatores JÁ calculados —
 * nunca recalcula. Sem provider real, mostra "indisponível".
 */
export function CandidateCard({
  result,
  rank,
  availabilityTone,
  availabilityLabel,
  aiEnabled,
  aiProviderReady,
}: CandidateCardProps) {
  const [isPending, startTransition] = useTransition();
  const [explanation, setExplanation] = useState<ExplainAllocationResult | null>(
    null,
  );

  function requestExplanation() {
    startTransition(async () => {
      const res = await explainAllocationSuggestion({
        consultantName: result.consultantName,
        score: result.score,
        factors: result.factors.map((f) => ({
          label: f.label,
          score01: f.score01,
          detail: f.detail,
        })),
      });
      setExplanation(res);
    });
  }

  return (
    <article className="rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-md border-2 border-ink bg-brand-soft text-sm font-bold text-brand-dark shadow-[2px_2px_0_0_var(--color-ink)]">
            {rank}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-strong">
              {result.consultantName}
            </h3>
            <p className="text-xs text-soft">
              {result.jobTitle ?? result.seniority}
              {result.area ? ` · ${result.area}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={availabilityTone}>{availabilityLabel}</StatusBadge>
          <StatusBadge tone={scoreTone(result.score)} strong>
            {result.score}/100
          </StatusBadge>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Breakdown por fator */}
        <div className="space-y-2.5">
          {result.factors.map((f) => (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-strong">{f.label}</span>
                <span className="text-soft">
                  peso {Math.round(f.weight * 100)}% · {Math.round(f.score01 * 100)}%
                  → +{Math.round(f.contribution)} pts
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-ink/20 bg-surface-muted">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.round(f.score01 * 100)}%` }}
                />
              </div>
              <p className="text-xs text-soft">{f.detail}</p>
            </div>
          ))}
        </div>

        {/* Detalhe por skill exigida */}
        {result.skillDetails.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-soft">
              Skills exigidas ({result.skillsMet}/{result.skillsRequired})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {result.skillDetails.map((sd) => (
                <span
                  key={sd.skillId}
                  className={
                    sd.meets
                      ? "inline-flex items-center gap-1 rounded-md border border-success/30 bg-success-soft px-2 py-0.5 text-xs font-medium text-success"
                      : "inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger"
                  }
                >
                  {sd.skillName}
                  {sd.requiredLevel ? ` · req. ${skillLevelLabels[sd.requiredLevel]}` : ""}
                  {sd.currentLevel
                    ? ` · tem ${skillLevelLabels[sd.currentLevel]}`
                    : " · não possui"}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Explicação por IA (opcional, atrás de flag) */}
        {aiEnabled ? (
          <div className="border-t border-border pt-3">
            <ActionButton
              variant="secondary"
              size="sm"
              icon={Sparkles}
              onClick={requestExplanation}
              disabled={isPending}
            >
              {isPending ? "Gerando…" : "Explicar com IA"}
            </ActionButton>
            {explanation ? (
              explanation.available && explanation.text ? (
                <p className="mt-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand-dark">
                  <Sparkles aria-hidden="true" className="mr-1 inline size-3.5" />
                  {explanation.text}
                  <span className="ml-1 font-semibold">(gerado por IA)</span>
                </p>
              ) : (
                <p className="mt-2 text-xs text-soft">
                  Explicação por IA indisponível
                  {aiProviderReady ? "" : " (provedor não configurado)"} — o
                  ranking determinístico acima permanece válido.
                </p>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
