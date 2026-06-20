"use client";

import { useId } from "react";
import { levelWeightToScore } from "@/lib/evaluations/scale";
import type { EvaluationGapRow, RadarAxis } from "@/lib/evaluations/types";

export interface RadarChartProps {
  axes: RadarAxis[];
  /** Linhas de gap (carregam o requiredWeight para desenhar o alvo). */
  gap: EvaluationGapRow[];
}

/**
 * Radar de competências em SVG puro (sem lib de chart). Desenha a média de
 * score (1–5) por competência e, quando o perfil aplicável define um nível
 * requerido, sobrepõe o "alvo" convertido para a mesma escala 1–5 (DP-06 via
 * `levelWeightToScore`). Com menos de 3 eixos um radar é ilegível: nesse caso o
 * chamador usa a tabela; aqui só renderizamos o polígono para 3+ eixos.
 */
export function RadarChart({ axes, gap }: RadarChartProps) {
  const titleId = useId();
  const size = 320;
  const center = size / 2;
  const radius = center - 56;
  const maxScore = 5;
  const rings = [1, 2, 3, 4, 5];

  const requiredBySkill = new Map(
    gap
      .filter((g) => g.requiredWeight !== null)
      .map((g) => [g.skillId, g.requiredWeight as number]),
  );

  if (axes.length < 3) {
    return null;
  }

  const angleFor = (i: number) => (Math.PI * 2 * i) / axes.length - Math.PI / 2;
  const pointAt = (i: number, value: number) => {
    const r = (value / maxScore) * radius;
    const a = angleFor(i);
    return { x: center + r * Math.cos(a), y: center + r * Math.sin(a) };
  };

  const scorePath = axes
    .map((axis, i) => {
      const p = pointAt(i, axis.averageScore);
      return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    })
    .join(" ");

  const hasTarget = axes.some((a) => requiredBySkill.has(a.skillId));
  const targetPath = hasTarget
    ? axes
        .map((axis, i) => {
          const w = requiredBySkill.get(axis.skillId);
          const expected = w === undefined ? 0 : levelWeightToScore(w);
          const p = pointAt(i, expected);
          return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        })
        .join(" ") + " Z"
    : null;

  return (
    <figure className="flex flex-col items-center gap-3">
      <svg
        role="img"
        aria-labelledby={titleId}
        viewBox={`0 0 ${size} ${size}`}
        className="h-auto w-full max-w-sm"
      >
        <title id={titleId}>
          Radar de competências: média de score por competência
          {hasTarget ? " com o nível requerido sobreposto" : ""}.
        </title>
        {/* Anéis de referência (1..5) */}
        {rings.map((ring) => (
          <circle
            key={ring}
            cx={center}
            cy={center}
            r={(ring / maxScore) * radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={1}
          />
        ))}
        {/* Eixos + rótulos */}
        {axes.map((axis, i) => {
          const edge = pointAt(i, maxScore);
          const label = pointAt(i, maxScore + 0.9);
          return (
            <g key={axis.skillId}>
              <line
                x1={center}
                y1={center}
                x2={edge.x}
                y2={edge.y}
                stroke="var(--color-border)"
                strokeWidth={1}
              />
              <text
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-medium text-[9px] font-medium"
              >
                {axis.skillName.length > 14
                  ? `${axis.skillName.slice(0, 13)}…`
                  : axis.skillName}
              </text>
            </g>
          );
        })}
        {/* Alvo (nível requerido) */}
        {targetPath ? (
          <path
            d={targetPath}
            fill="none"
            stroke="var(--color-warning)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        ) : null}
        {/* Média avaliada */}
        <path
          d={`${scorePath} Z`}
          fill="var(--color-brand)"
          fillOpacity={0.22}
          stroke="var(--color-brand)"
          strokeWidth={2}
        />
        {axes.map((axis, i) => {
          const p = pointAt(i, axis.averageScore);
          return (
            <circle
              key={`pt-${axis.skillId}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="var(--color-brand)"
            />
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap items-center justify-center gap-4 text-xs text-medium">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-brand" aria-hidden="true" />
          Média avaliada (1–5)
        </span>
        {hasTarget ? (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-3 rounded-sm border-2 border-dashed border-warning"
              aria-hidden="true"
            />
            Nível requerido (perfil)
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
