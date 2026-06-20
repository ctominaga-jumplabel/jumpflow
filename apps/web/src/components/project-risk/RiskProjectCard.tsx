"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  riskLevelLabels,
  type RiskLevel,
  type RiskResult,
} from "@/lib/project-risk/types";
import {
  analyzeProjectSentiment,
  type RiskSentimentResult,
} from "@/app/app/risco-projetos/actions";

export interface RiskProjectCardProps {
  result: RiskResult;
  /** Mostra o breakdown completo + recomendações (detalhe). Lista = compacto. */
  expanded: boolean;
  aiEnabled: boolean;
  aiProviderReady: boolean;
}

const levelTone: Record<RiskLevel, StatusTone> = {
  GREEN: "success",
  YELLOW: "warning",
  RED: "danger",
};

const levelDot: Record<RiskLevel, string> = {
  GREEN: "bg-success",
  YELLOW: "bg-warning",
  RED: "bg-danger",
};

/**
 * Cartão de risco de UM projeto (§8.3). Mostra o semáforo (verde/amarelo/
 * vermelho), o score e — quando `expanded` — o BREAKDOWN transparente por sinal
 * (peso, intensidade do risco, contribuição) e as recomendações determinísticas.
 * O botão "Analisar sentimento (IA)" só renderiza com a flag ligada; chama a
 * server action que retorna um sinal À PARTE — NÃO altera o nível. Sem provider
 * real, mostra "indisponível".
 */
export function RiskProjectCard({
  result,
  expanded,
  aiEnabled,
  aiProviderReady,
}: RiskProjectCardProps) {
  const [isPending, startTransition] = useTransition();
  const [sentiment, setSentiment] = useState<RiskSentimentResult | null>(null);

  function requestSentiment() {
    startTransition(async () => {
      const res = await analyzeProjectSentiment({ projectId: result.projectId });
      setSentiment(res);
    });
  }

  return (
    <article className="rounded-[var(--radius-card)] border-2 border-ink bg-surface shadow-[4px_4px_0_0_var(--color-ink)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={`size-4 rounded-full border-2 border-ink ${levelDot[result.level]}`}
          />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-strong">
              {result.projectName}
            </h3>
            {result.clientName ? (
              <p className="text-xs text-soft">{result.clientName}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge tone={levelTone[result.level]} strong>
            {riskLevelLabels[result.level]}
          </StatusBadge>
          <StatusBadge tone={levelTone[result.level]}>
            risco {result.score}/100
          </StatusBadge>
        </div>
      </div>

      <div className="space-y-4 px-5 py-4">
        {/* Breakdown por sinal */}
        <div className="space-y-2.5">
          {result.signals.map((s) => (
            <div key={s.key} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-strong">{s.label}</span>
                <span className="text-soft">
                  peso {Math.round(s.weight * 100)}% · risco{" "}
                  {Math.round(s.risk01 * 100)}% → +{Math.round(s.contribution)} pts
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full border border-ink/20 bg-surface-muted">
                <div
                  className={`h-full rounded-full ${riskBar(s.risk01)}`}
                  style={{ width: `${Math.round(s.risk01 * 100)}%` }}
                />
              </div>
              {expanded ? (
                <p className="text-xs text-soft">{s.detail}</p>
              ) : null}
            </div>
          ))}
        </div>

        {expanded ? (
          <>
            {/* Recomendações determinísticas */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                Recomendações
              </p>
              <ul className="list-disc space-y-1 pl-5 text-xs text-medium">
                {result.recommendations.map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
              </ul>
            </div>

            {/* Sentimento por IA (sinal à parte, atrás de flag) */}
            {aiEnabled ? (
              <div className="border-t border-border pt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                    Sentimento (sinal complementar)
                  </p>
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    icon={Sparkles}
                    onClick={requestSentiment}
                    disabled={isPending}
                  >
                    {isPending ? "Analisando…" : "Analisar sentimento (IA)"}
                  </ActionButton>
                </div>
                <p className="mt-1 text-xs text-soft">
                  Sinal de IA <strong>complementar</strong> — não altera o nível de
                  risco determinístico acima.
                </p>
                {sentiment ? (
                  sentiment.available && sentiment.text ? (
                    <p className="mt-2 rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand-dark">
                      <Sparkles aria-hidden="true" className="mr-1 inline size-3.5" />
                      {sentiment.text}
                      <span className="ml-1 font-semibold">
                        (gerado por IA · {sentiment.sampleSize} comentário(s))
                      </span>
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-soft">
                      Sentimento por IA indisponível
                      {aiProviderReady ? "" : " (provedor não configurado)"} — o
                      nível de risco determinístico permanece válido.
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

function riskBar(risk01: number): string {
  if (risk01 >= 0.65) return "bg-danger";
  if (risk01 >= 0.35) return "bg-warning";
  return "bg-success";
}
