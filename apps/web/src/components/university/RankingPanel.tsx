"use client";

import { Trophy } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { RankingRow } from "@/lib/university/types";

export interface RankingPanelProps {
  ranking: RankingRow[];
  /** Consultor do espectador, para destacar a própria linha (se aplicável). */
  highlightConsultantId: string | null;
}

/**
 * Ranking AGREGADO de gamificação (nomes). Visível apenas a ADMIN/PEOPLE/
 * AREA_MANAGER (gating no servidor); o consultor comum vê só a própria posição no
 * resumo, não esta lista. Pontos derivados das conclusões — sem tabela de pontos.
 */
export function RankingPanel({
  ranking,
  highlightConsultantId,
}: RankingPanelProps) {
  return (
    <SectionPanel
      title="Ranking da JumpAcademy"
      description="Pontos derivados das conclusões de curso (base por conclusão + bônus por carga horária)."
    >
      {ranking.length === 0 ? (
        <div className="px-5 py-10">
          <EmptyState
            icon={Trophy}
            title="Ainda sem conclusões"
            description="Quando os consultores concluírem cursos, o ranking aparece aqui."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {ranking.map((row) => {
            const mine = row.consultantId === highlightConsultantId;
            return (
              <li
                key={row.consultantId}
                className={`flex items-center justify-between gap-3 px-5 py-3 ${
                  mine ? "bg-brand-soft" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-md border-2 border-ink bg-marker text-sm font-bold text-ink">
                    {row.position}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-strong">
                      {row.consultantName}
                    </span>
                    {mine ? (
                      <StatusBadge tone="info" className="ml-2">
                        Você
                      </StatusBadge>
                    ) : null}
                    <p className="text-xs text-soft">
                      {row.completedCourses} curso(s) · {row.hoursCompleted}h
                    </p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-strong">
                  {row.points} pts
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionPanel>
  );
}
