"use client";

import { useState, useTransition } from "react";
import { Sparkles, TrendingDown, TrendingUp, Minus, HelpCircle } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  scoreBandLabels,
  scoreTrendLabels,
  type ScoreBand,
  type ScoreResult,
  type ScoreTrend,
} from "@/lib/consultant-score/types";
import {
  narrateConsultantScore,
  type NarrateScoreResult,
} from "@/app/app/score/actions";

export interface ScoreConsultantCardProps {
  result: ScoreResult;
  /** Mostra o breakdown completo + tendência + narrativa (detalhe). Lista = compacto. */
  expanded: boolean;
  aiEnabled: boolean;
  aiProviderReady: boolean;
}

const bandTone: Record<ScoreBand, StatusTone> = {
  HIGH: "success",
  MEDIUM: "info",
  LOW: "danger",
};

const trendTone: Record<ScoreTrend, StatusTone> = {
  UP: "success",
  DOWN: "danger",
  STABLE: "neutral",
  UNKNOWN: "neutral",
};

const trendIcon = {
  UP: TrendingUp,
  DOWN: TrendingDown,
  STABLE: Minus,
  UNKNOWN: HelpCircle,
} as const;

/**
 * Cartão de score de UM consultor (§8.4). Mostra o score, a faixa (alto/médio/
 * baixo), a tendência e — quando `expanded` — o BREAKDOWN transparente por fator
 * (peso, desempenho, contribuição) e a narrativa por IA (atrás de flag). A
 * narrativa recebe o breakdown JÁ calculado e só o verbaliza; NÃO recalcula o
 * número. Sem provider real, mostra "indisponível". Sem chart externo, sem
 * animação.
 */
export function ScoreConsultantCard({
  result,
  expanded,
  aiEnabled,
  aiProviderReady,
}: ScoreConsultantCardProps) {
  const [isPending, startTransition] = useTransition();
  const [narrative, setNarrative] = useState<NarrateScoreResult | null>(null);

  function requestNarrative() {
    startTransition(async () => {
      const res = await narrateConsultantScore({
        consultantName: result.consultantName,
        score: result.score,
        trend: result.trend,
        factors: result.factors.map((f) => ({
          label: f.label,
          score01: f.score01,
          available: f.available,
          detail: f.detail,
        })),
      });
      setNarrative(res);
    });
  }

  const TrendIcon = trendIcon[result.trend];

  return (
    <article className="rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-strong">
            {result.consultantName}
          </h3>
          <p className="text-xs text-soft">
            {result.jobTitle ?? result.seniority}
            {result.area ? ` · ${result.area}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={trendTone[result.trend]}>
            <TrendIcon aria-hidden="true" className="size-3.5" />
            {scoreTrendLabels[result.trend]}
            {result.evaluationDelta !== null && result.trend !== "STABLE"
              ? ` (${result.evaluationDelta > 0 ? "+" : ""}${result.evaluationDelta.toFixed(1)})`
              : ""}
          </StatusBadge>
          <StatusBadge tone={bandTone[result.band]}>
            {scoreBandLabels[result.band]}
          </StatusBadge>
          <StatusBadge tone={bandTone[result.band]} strong>
            {result.score}/100
          </StatusBadge>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Breakdown por fator (sempre visível — transparência total) */}
        <div className="space-y-2.5">
          {result.factors.map((f) => (
            <div key={f.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-strong">
                  {f.label}
                  {!f.available ? (
                    <span className="ml-1 font-normal text-soft">(sem dado)</span>
                  ) : null}
                </span>
                <span className="text-soft">
                  peso {Math.round(f.weight * 100)}% · {Math.round(f.score01 * 100)}%
                  → +{Math.round(f.contribution)} pts
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-ink/20 bg-surface-muted">
                <div
                  className={`h-full rounded-full ${f.available ? "bg-brand" : "bg-ink/20"}`}
                  style={{ width: `${Math.round(f.score01 * 100)}%` }}
                />
              </div>
              {expanded ? (
                <p className="text-xs text-soft">{f.detail}</p>
              ) : null}
            </div>
          ))}
        </div>

        {expanded ? (
          <>
            {/* Narrativa por IA (opcional, atrás de flag) */}
            {aiEnabled ? (
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                    Narrativa do score
                  </p>
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    icon={Sparkles}
                    onClick={requestNarrative}
                    disabled={isPending}
                  >
                    {isPending ? "Gerando…" : "Explicar com IA"}
                  </ActionButton>
                </div>
                <p className="mt-1 text-xs text-soft">
                  Texto de IA <strong>complementar</strong> — não altera o score
                  determinístico acima.
                </p>
                {narrative ? (
                  narrative.available && narrative.text ? (
                    <p className="mt-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand-dark">
                      <Sparkles aria-hidden="true" className="mr-1 inline size-3.5" />
                      {narrative.text}
                      <span className="ml-1 font-semibold">(gerado por IA)</span>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-soft">
                      Narrativa por IA indisponível
                      {aiProviderReady ? "" : " (provedor não configurado)"} — o
                      score determinístico permanece válido.
                    </p>
                  )
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </article>
  );
}
