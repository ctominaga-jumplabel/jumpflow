"use client";

import { useState } from "react";
import { BarChart3, ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  surveyStatusLabels,
  surveyTypeLabels,
  type SurveyDashboard,
  type SurveySummary,
} from "@/lib/surveys/types";

export interface SurveyDashboardPanelProps {
  surveys: SurveySummary[];
  dashboards: Record<string, SurveyDashboard>;
}

/**
 * Dashboards agregados (anônimos) por pesquisa. Sem lib de chart: barras em
 * CSS/SVG simples. O piso mínimo de exibição é decidido no servidor
 * (`dashboard.disclosed`); quando não atingido, mostramos só a taxa de resposta
 * e o aviso de anonimato — nunca médias/NPS/distribuição.
 */
export function SurveyDashboardPanel({
  surveys,
  dashboards,
}: SurveyDashboardPanelProps) {
  const withDashboard = surveys.filter((s) => dashboards[s.id]);
  const [selectedId, setSelectedId] = useState<string | null>(
    withDashboard[0]?.id ?? null,
  );

  if (withDashboard.length === 0) {
    return (
      <SectionPanel title="Dashboards" description="Resultados agregados por pesquisa.">
        <div className="px-5 py-10">
          <EmptyState
            icon={BarChart3}
            title="Sem dados ainda"
            description="Os dashboards aparecem quando uma pesquisa começa a receber respostas."
          />
        </div>
      </SectionPanel>
    );
  }

  const dashboard = selectedId ? dashboards[selectedId] : null;

  return (
    <div className="space-y-4">
      <SectionPanel title="Dashboards" description="Resultados agregados e anônimos por pesquisa.">
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {withDashboard.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={selectedId === s.id}
              onClick={() => setSelectedId(s.id)}
              className={
                selectedId === s.id
                  ? "rounded-md border-2 border-ink bg-marker px-3 py-1.5 text-xs font-semibold text-ink shadow-[2px_2px_0_0_var(--color-ink)]"
                  : "rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-medium hover:bg-surface-muted"
              }
            >
              {s.title}
            </button>
          ))}
        </div>
      </SectionPanel>

      {dashboard ? <DashboardBody dashboard={dashboard} /> : null}
    </div>
  );
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function DashboardBody({ dashboard }: { dashboard: SurveyDashboard }) {
  return (
    <SectionPanel
      title={dashboard.surveyTitle}
      description={`${surveyTypeLabels[dashboard.surveyType]} · ${surveyStatusLabels[dashboard.status]}`}
    >
      <div className="space-y-5 px-5 py-4">
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <div>
            <p className="text-xs text-soft">Convidados</p>
            <p className="text-lg font-semibold text-strong tabular-nums">
              {dashboard.invitationCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-soft">Respostas</p>
            <p className="text-lg font-semibold text-strong tabular-nums">
              {dashboard.responseCount}
            </p>
          </div>
          <div>
            <p className="text-xs text-soft">Taxa de resposta</p>
            <p className="text-lg font-semibold text-strong tabular-nums">
              {pct(dashboard.responseRate)}
            </p>
          </div>
          {dashboard.anonymous ? (
            <StatusBadge tone="info">Anônima</StatusBadge>
          ) : null}
        </div>

        {!dashboard.disclosed ? (
          <div className="flex items-start gap-3 rounded-md border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>
              Resultados ocultos para preservar o anonimato. São necessárias ao
              menos {dashboard.minToDisclose} respostas para exibir as
              agregações (atual: {dashboard.responseCount}).
            </span>
          </div>
        ) : (
          <>
            {dashboard.nps.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-strong">eNPS / NPS</h3>
                {dashboard.nps.map((n) => (
                  <div key={n.questionId} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-medium">
                        {n.questionText}
                      </span>
                      <span className="text-lg font-bold tabular-nums text-strong">
                        {n.score}
                      </span>
                    </div>
                    <NpsBar
                      promoters={n.promoters}
                      passives={n.passives}
                      detractors={n.detractors}
                      total={n.total}
                    />
                    <p className="text-xs text-soft">
                      {n.promoters} promotores · {n.passives} neutros ·{" "}
                      {n.detractors} detratores
                    </p>
                  </div>
                ))}
              </div>
            ) : null}

            {dashboard.scales.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-strong">Médias (1-5)</h3>
                {dashboard.scales.map((s) => (
                  <div key={s.questionId} className="space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-medium">{s.questionText}</span>
                      <span className="text-sm font-semibold tabular-nums text-strong">
                        {s.average.toFixed(2)}
                      </span>
                    </div>
                    <ProgressBar value={s.average / 5} />
                  </div>
                ))}
              </div>
            ) : null}

            {dashboard.choices.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-strong">Distribuição</h3>
                {dashboard.choices.map((c) => (
                  <div key={c.questionId} className="space-y-1.5">
                    <span className="text-sm text-medium">{c.questionText}</span>
                    {c.items.map((item) => {
                      const ratio = c.total > 0 ? item.count / c.total : 0;
                      return (
                        <div key={item.option} className="space-y-0.5">
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="text-soft">{item.option}</span>
                            <span className="tabular-nums text-medium">
                              {item.count} ({pct(ratio)})
                            </span>
                          </div>
                          <ProgressBar value={ratio} />
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ) : null}

            {dashboard.nps.length === 0 &&
            dashboard.scales.length === 0 &&
            dashboard.choices.length === 0 ? (
              <p className="text-sm text-soft">
                Esta pesquisa não tem perguntas agregáveis (apenas respostas
                abertas, que não são exibidas no dashboard por anonimato).
              </p>
            ) : null}
          </>
        )}
      </div>
    </SectionPanel>
  );
}

function NpsBar({
  promoters,
  passives,
  detractors,
  total,
}: {
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}) {
  const safeTotal = total > 0 ? total : 1;
  const segments = [
    { key: "promoters", value: promoters, className: "bg-success" },
    { key: "passives", value: passives, className: "bg-warning" },
    { key: "detractors", value: detractors, className: "bg-danger" },
  ];
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full border border-border">
      {segments.map((s) => (
        <div
          key={s.key}
          className={s.className}
          style={{ width: `${(s.value / safeTotal) * 100}%` }}
        />
      ))}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full border border-border bg-surface-muted">
      <div
        className="h-full bg-brand"
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}
