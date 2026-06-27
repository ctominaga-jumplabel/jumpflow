"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  Loader2,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { FeedbackTone } from "@/components/ui/Feedback";
import {
  insightStatusLabels,
  insightStatusTone,
  opportunityKindLabels,
  opportunityPriorityLabels,
  opportunityPriorityTone,
  type CaseInsightItem,
  type CheckpointInsights,
  type InsightStatus,
  type OpportunityInsightItem,
  type PipelineStatus,
} from "@/lib/checkpoint/types";
import {
  decideCase,
  decideOpportunity,
  extractCheckpointInsights,
} from "@/app/app/checkpoints/actions";

export interface CheckpointInsightsPanelProps {
  checkpointId: string;
  extractionStatus: PipelineStatus;
  insights: CheckpointInsights;
  notify: (tone: FeedbackTone, text: string) => void;
}

const extractionLabel: Record<PipelineStatus, string> = {
  NONE: "Não extraído",
  PENDING: "Em processamento",
  DONE: "Insights extraídos",
  FAILED: "Falhou",
};

/**
 * Painel de insights de um checkpoint (FATIA 5), atrás de `isCheckpointAiEnabled`
 * — quando a flag está off, este componente não é renderizado (a CheckpointView
 * decide). Três blocos:
 *
 * - Skills: NÃO duplicamos a curadoria; apenas um CTA que linka /app/skills.
 * - Oportunidades e Cases: candidatos PENDING com trecho-evidência (sourceQuote)
 *   e botões Aceitar/Descartar (decideOpportunity / decideCase). O estado reflete
 *   localmente a decisão (otimista) e o servidor revalida o caminho.
 *
 * Degradação honesta: quando a extração volta `unavailable`, mostramos "IA
 * indisponível" — nunca inventamos insights.
 */
export function CheckpointInsightsPanel({
  checkpointId,
  extractionStatus,
  insights,
  notify,
}: CheckpointInsightsPanelProps) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<PipelineStatus>(extractionStatus);
  const [unavailable, setUnavailable] = useState(false);
  // Decisões aplicadas localmente (otimista) sobre o status servido.
  const [decided, setDecided] = useState<Record<string, InsightStatus>>({});

  function extract() {
    startTransition(async () => {
      const result = await extractCheckpointInsights(checkpointId);
      if (result.ok) {
        if (result.data.unavailable) {
          setUnavailable(true);
          notify("info", "IA indisponível no momento.");
        } else {
          setUnavailable(false);
          setStatus("DONE");
          notify(
            "success",
            `Extração concluída: ${result.data.skills} skill(s), ${result.data.opportunities} oportunidade(s), ${result.data.cases} case(s).`,
          );
        }
      } else {
        setStatus("FAILED");
        notify("warning", result.message);
      }
    });
  }

  function decide(
    kind: "opportunity" | "case",
    id: string,
    decision: "ACCEPTED" | "DISMISSED",
  ) {
    startTransition(async () => {
      const result =
        kind === "opportunity"
          ? await decideOpportunity({ id, decision })
          : await decideCase({ id, decision });
      if (result.ok) {
        setDecided((prev) => ({ ...prev, [id]: result.data.status }));
        notify(
          "success",
          decision === "ACCEPTED" ? "Insight aceito." : "Insight descartado.",
        );
      } else {
        notify("warning", result.message);
      }
    });
  }

  function statusOf(item: { id: string; status: InsightStatus }): InsightStatus {
    return decided[item.id] ?? item.status;
  }

  const hasInsights =
    insights.opportunities.length > 0 || insights.cases.length > 0;

  return (
    <div className="space-y-4" data-testid="checkpoint-insights">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-strong">
          <Sparkles aria-hidden="true" className="size-4" />
          Insights
        </span>
        <StatusBadge tone={status === "DONE" ? "success" : "neutral"}>
          {unavailable ? "IA indisponível" : extractionLabel[status]}
        </StatusBadge>
        <ActionButton
          variant="secondary"
          size="sm"
          icon={pending ? Loader2 : Sparkles}
          disabled={pending}
          onClick={extract}
          className="ml-auto"
        >
          {status === "NONE" ? "Extrair insights" : "Reprocessar"}
        </ActionButton>
      </div>

      {unavailable ? (
        <p className="flex items-center gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-soft">
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          A extração por IA está indisponível agora (provedor não configurado).
          Nenhum insight foi inventado.
        </p>
      ) : null}

      {/* Skills: curadoria EXISTENTE, não duplicada aqui. */}
      <section aria-label="Skills" className="space-y-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-soft">
          Skills
        </h4>
        <p className="text-sm text-medium">
          As skills sugeridas entram na curadoria existente.{" "}
          <Link
            href="/app/skills"
            className="font-semibold text-brand-dark underline underline-offset-2"
          >
            Ver na curadoria de Skills
          </Link>
          .
        </p>
      </section>

      <section aria-label="Oportunidades" className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-soft">
          Oportunidades
        </h4>
        {insights.opportunities.length === 0 ? (
          <p className="text-sm text-soft">Nenhuma oportunidade identificada.</p>
        ) : (
          <ul className="space-y-2">
            {insights.opportunities.map((item) => (
              <OpportunityRow
                key={item.id}
                item={item}
                status={statusOf(item)}
                pending={pending}
                onDecide={(decision) =>
                  decide("opportunity", item.id, decision)
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Cases" className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-soft">
          Cases
        </h4>
        {insights.cases.length === 0 ? (
          <p className="text-sm text-soft">Nenhum case identificado.</p>
        ) : (
          <ul className="space-y-2">
            {insights.cases.map((item) => (
              <CaseRow
                key={item.id}
                item={item}
                status={statusOf(item)}
                pending={pending}
                onDecide={(decision) => decide("case", item.id, decision)}
              />
            ))}
          </ul>
        )}
      </section>

      {!hasInsights && status === "DONE" && !unavailable ? (
        <p className="text-xs text-soft">
          A IA não encontrou oportunidades ou cases neste checkpoint.
        </p>
      ) : null}
    </div>
  );
}

function DecisionControls({
  status,
  pending,
  onDecide,
}: {
  status: InsightStatus;
  pending: boolean;
  onDecide: (decision: "ACCEPTED" | "DISMISSED") => void;
}) {
  if (status !== "PENDING") {
    return (
      <StatusBadge tone={insightStatusTone[status]}>
        {insightStatusLabels[status]}
      </StatusBadge>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <ActionButton
        variant="success"
        size="sm"
        icon={Check}
        disabled={pending}
        onClick={() => onDecide("ACCEPTED")}
      >
        Aceitar
      </ActionButton>
      <ActionButton
        variant="secondary"
        size="sm"
        icon={X}
        disabled={pending}
        onClick={() => onDecide("DISMISSED")}
      >
        Descartar
      </ActionButton>
    </div>
  );
}

function SourceQuote({ quote }: { quote: string | null }) {
  if (!quote) return null;
  return (
    <blockquote className="mt-2 border-l-2 border-border pl-3 text-xs italic text-soft">
      “{quote}”
    </blockquote>
  );
}

function OpportunityRow({
  item,
  status,
  pending,
  onDecide,
}: {
  item: OpportunityInsightItem;
  status: InsightStatus;
  pending: boolean;
  onDecide: (decision: "ACCEPTED" | "DISMISSED") => void;
}) {
  return (
    <li className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="info">{opportunityKindLabels[item.kind]}</StatusBadge>
        <StatusBadge tone={opportunityPriorityTone[item.priority]}>
          {opportunityPriorityLabels[item.priority]}
        </StatusBadge>
        <span className="text-sm font-semibold text-strong">{item.title}</span>
      </div>
      {item.description ? (
        <p className="mt-1 text-sm leading-6 text-medium">{item.description}</p>
      ) : null}
      <SourceQuote quote={item.sourceQuote} />
      <div className="mt-2 flex justify-end">
        <DecisionControls status={status} pending={pending} onDecide={onDecide} />
      </div>
    </li>
  );
}

function CaseRow({
  item,
  status,
  pending,
  onDecide,
}: {
  item: CaseInsightItem;
  status: InsightStatus;
  pending: boolean;
  onDecide: (decision: "ACCEPTED" | "DISMISSED") => void;
}) {
  return (
    <li className="rounded-md border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="success">Case</StatusBadge>
        <span className="text-sm font-semibold text-strong">{item.title}</span>
      </div>
      {item.summary ? (
        <p className="mt-1 text-sm leading-6 text-medium">{item.summary}</p>
      ) : null}
      {item.outcome ? (
        <p className="mt-1 text-xs text-soft">Resultado: {item.outcome}</p>
      ) : null}
      <SourceQuote quote={item.sourceQuote} />
      <div className="mt-2 flex justify-end">
        <DecisionControls status={status} pending={pending} onDecide={onDecide} />
      </div>
    </li>
  );
}
