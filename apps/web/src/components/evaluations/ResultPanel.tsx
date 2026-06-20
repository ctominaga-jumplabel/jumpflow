"use client";

import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import {
  evaluationRelationshipLabels,
  type EvaluationGapRow,
  type EvaluationResult,
  type HistorySeries,
  type EvaluationRelationship,
} from "@/lib/evaluations/types";
import { RadarChart } from "./RadarChart";

const gapTone: Record<EvaluationGapRow["status"], StatusTone> = {
  GAP: "warning",
  MEETS: "success",
  NO_REQUIREMENT: "neutral",
};

const gapLabel: Record<EvaluationGapRow["status"], string> = {
  GAP: "Lacuna",
  MEETS: "Atende",
  NO_REQUIREMENT: "Sem requerido",
};

export interface ResultPanelProps {
  result: EvaluationResult;
  /** Série histórica do consultor (pode ser vazia). */
  history: HistorySeries[];
}

/**
 * Resultado consolidado (US16.04/US16.05): radar (média por competência), gap
 * (média convertida × requerido) e evolução histórica. As respostas individuais
 * de pares nunca aparecem aqui — só agregados (anonimato, DP-05). O servidor já
 * decidiu que este espectador pode ver este resultado.
 */
export function ResultPanel({ result, history }: ResultPanelProps) {
  const hasRadar = result.radar.length > 0;
  // Defesa em profundidade (LGPD/DP-05): o servidor já suprime a contagem de
  // PEER não divulgável (1 par) para o sujeito. Aqui só renderizamos chaves
  // presentes e com contagem > 0 — nunca expomos um PEER ausente/suprimido.
  const relationships = (
    Object.entries(result.raterCountByRelationship) as [
      EvaluationRelationship,
      number,
    ][]
  ).filter(([, count]) => count > 0);

  return (
    <div className="space-y-4">
      <SectionPanel
        title={`Resultado · ${result.subjectConsultantName}`}
        description={`${result.cycleName}${
          result.profileName ? ` · perfil: ${result.profileName}` : " · sem perfil aplicável"
        }`}
      >
        <div className="space-y-5 px-5 py-4">
          {relationships.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {relationships.map(([rel, count]) => (
                <StatusBadge key={rel} tone="info">
                  {evaluationRelationshipLabels[rel]}: {count}
                </StatusBadge>
              ))}
            </div>
          ) : null}

          {!hasRadar ? (
            <p className="text-sm text-medium">
              Ainda não há respostas submetidas para consolidar o resultado.
            </p>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              {result.radar.length >= 3 ? (
                <RadarChart axes={result.radar} gap={result.gap} />
              ) : (
                <div className="rounded-md border border-border bg-surface-muted px-4 py-6 text-sm text-soft">
                  O radar precisa de pelo menos 3 competências. Veja a tabela ao
                  lado para o detalhe por competência.
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-soft">
                      <th className="py-2 pr-2 font-medium">Competência</th>
                      <th className="py-2 px-2 font-medium">Média</th>
                      <th className="py-2 px-2 font-medium">Requerido</th>
                      <th className="py-2 pl-2 font-medium">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.gap.map((row) => (
                      <tr key={row.skillId} className="border-b border-border/60">
                        <td className="py-2 pr-2 text-strong">{row.skillName}</td>
                        <td className="py-2 px-2 tabular-nums text-medium">
                          {row.averageScore.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 tabular-nums text-medium">
                          {row.requiredWeight === null
                            ? "—"
                            : row.requiredWeight.toFixed(0)}
                        </td>
                        <td className="py-2 pl-2">
                          <StatusBadge tone={gapTone[row.status]}>
                            {row.status === "NO_REQUIREMENT"
                              ? gapLabel[row.status]
                              : `${gapLabel[row.status]}${
                                  row.gap !== null && row.gap > 0
                                    ? ` (${row.gap.toFixed(1)})`
                                    : ""
                                }`}
                          </StatusBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </SectionPanel>

      {history.length > 0 ? (
        <SectionPanel
          title="Evolução histórica"
          description="Média por competência ao longo dos ciclos fechados. Competências adicionadas/removidas entre ciclos aparecem só nos ciclos em que foram avaliadas."
        >
          <div className="overflow-x-auto px-5 py-4">
            <HistoryTable history={history} />
          </div>
        </SectionPanel>
      ) : null}
    </div>
  );
}

function HistoryTable({ history }: { history: HistorySeries[] }) {
  // Colunas = ciclos distintos (mais antigo → mais recente).
  const cycleMap = new Map<string, { name: string; periodEnd: string }>();
  for (const series of history) {
    for (const p of series.points) {
      if (!cycleMap.has(p.cycleId)) {
        cycleMap.set(p.cycleId, { name: p.cycleName, periodEnd: p.periodEnd });
      }
    }
  }
  const cycles = [...cycleMap.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-soft">
          <th className="py-2 pr-2 font-medium">Competência</th>
          {cycles.map((c) => (
            <th key={c.id} className="py-2 px-2 font-medium">
              {c.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {history.map((series) => {
          const byCycle = new Map(
            series.points.map((p) => [p.cycleId, p.averageScore]),
          );
          return (
            <tr key={series.skillId} className="border-b border-border/60">
              <td className="py-2 pr-2 text-strong">{series.skillName}</td>
              {cycles.map((c) => {
                const v = byCycle.get(c.id);
                return (
                  <td
                    key={c.id}
                    className="py-2 px-2 tabular-nums text-medium"
                  >
                    {v === undefined ? "—" : v.toFixed(1)}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
