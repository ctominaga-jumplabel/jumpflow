"use client";

import { ArrowLeftRight, Star, UserX } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { skillLevelLabels } from "@/lib/competencies/types";
import { seniorityLabels } from "@/lib/consultants/labels";
import type { ConsultantSeniority } from "@/lib/consultants/schemas";
import { availabilityStateLabels } from "@/lib/availability/types";
import type { AvailabilityState } from "@/lib/availability/types";
import {
  brutalBorder,
  brutalShadow,
  brutalShadowSm,
  focusRingInput,
} from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { CoeSlotAssignment } from "@/lib/coe/types";

export interface CoeSlotCardProps {
  assignment: CoeSlotAssignment;
  index: number;
  onSwap: (slotKey: string, consultantId: string) => void;
  onClear: (slotKey: string) => void;
}

/** Tom do estado de disponibilidade. Nunca depende só de cor: o texto carrega o significado. */
const AVAILABILITY_TONE: Record<AvailabilityState, StatusTone> = {
  FREE: "success",
  BENCH: "success",
  PARTIAL: "warning",
  FULL: "danger",
  VACATION: "danger",
  ON_LEAVE: "danger",
  INACTIVE: "neutral",
};

function scoreTone(score: number): StatusTone {
  if (score >= 75) return "success";
  if (score >= 50) return "info";
  if (score >= 30) return "warning";
  return "danger";
}

function seniorityLabel(value: string): string {
  return seniorityLabels[value as ConsultantSeniority] ?? value;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/**
 * Uma FRENTE da composição: a pessoa sugerida, por que ela foi sugerida e como
 * trocá-la.
 *
 * O score do slot é sempre mostrado decomposto — o fit da IA de Alocação mais o
 * ajuste de senioridade, em pontos, lado a lado. Nada de número redondo sem
 * origem: quem decide a alocação precisa ver o que sustenta a sugestão.
 */
export function CoeSlotCard({
  assignment,
  index,
  onSwap,
  onClear,
}: CoeSlotCardProps) {
  const { slot, assigned } = assignment;
  // A lista de troca exclui quem já ocupa ESTA frente; quem ocupa outra aparece
  // marcado, porque escolhê-lo troca as duas frentes de lugar.
  const options = assignment.alternatives.filter(
    (c) => c.consultantId !== assigned?.consultantId,
  );

  return (
    <article
      className={cn(
        "rounded-[var(--radius-card)] bg-surface",
        brutalBorder,
        brutalShadow,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-9 place-items-center rounded-md bg-brand-soft text-sm font-bold text-brand-dark",
              brutalBorder,
              brutalShadowSm,
            )}
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-strong">{slot.label}</h3>
            <p className="text-xs text-soft">
              {slot.seniority
                ? `Senioridade exigida: ${seniorityLabel(slot.seniority)}`
                : "Sem senioridade exigida"}
              {` · ${slot.requiredSkills.length} skill(s) exigida(s)`}
            </p>
          </div>
        </div>
        {assigned ? (
          <div className="flex items-center gap-2">
            {assigned.fit.availabilityState ? (
              <StatusBadge
                tone={AVAILABILITY_TONE[assigned.fit.availabilityState]}
              >
                {availabilityStateLabels[assigned.fit.availabilityState]}
              </StatusBadge>
            ) : null}
            <StatusBadge tone={scoreTone(assigned.slotScore)} strong>
              {assigned.slotScore}/100
            </StatusBadge>
          </div>
        ) : (
          <StatusBadge tone="danger" strong>
            Sem candidato
          </StatusBadge>
        )}
      </div>

      <div className="space-y-4 px-5 py-4">
        {assigned ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-strong">
                {assigned.consultantName}
              </span>
              <span className="text-xs text-soft">
                {assigned.fit.jobTitle ??
                  seniorityLabel(assigned.fit.seniority)}
                {assigned.fit.area ? ` · ${assigned.fit.area}` : ""}
              </span>
              {assigned.isCoeMember && assigned.coeFocusArea ? (
                <StatusBadge
                  tone="info"
                  icon={<Star aria-hidden="true" className="size-3" />}
                >
                  {assigned.coeFocusArea}
                </StatusBadge>
              ) : null}
            </div>

            {/* Composição do score do slot: fit + ajuste de senioridade. */}
            <div className="rounded-md border border-border bg-surface-muted px-3 py-2 text-xs text-medium">
              Fit da alocação{" "}
              <strong className="text-strong">{assigned.fit.score}</strong>
              {" · senioridade "}
              <strong className="text-strong">
                {signed(assigned.seniorityDelta)}
              </strong>
              {" → score do slot "}
              <strong className="text-strong">{assigned.slotScore}</strong>
              <span className="ml-1 text-soft">
                ({assigned.seniorityDetail})
              </span>
            </div>

            {/* Breakdown por fator, herdado íntegro da IA de Alocação. */}
            <div className="space-y-2.5">
              {assigned.fit.factors.map((f) => (
                <div key={f.key} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-strong">{f.label}</span>
                    <span className="text-soft">
                      peso {Math.round(f.weight * 100)}% ·{" "}
                      {Math.round(f.score01 * 100)}% → +
                      {Math.round(f.contribution)} pts
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full border border-ink/20 bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-brand-fill"
                      style={{ width: `${Math.round(f.score01 * 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-soft">{f.detail}</p>
                </div>
              ))}
            </div>

            {assigned.fit.skillDetails.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                  Skills exigidas ({assigned.fit.skillsMet}/
                  {assigned.fit.skillsRequired})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {assigned.fit.skillDetails.map((sd) => (
                    <span
                      key={sd.skillId}
                      className={
                        sd.meets
                          ? "inline-flex items-center gap-1 rounded-md border border-success/30 bg-success-soft px-2 py-0.5 text-xs font-medium text-success"
                          : "inline-flex items-center gap-1 rounded-md border border-danger/30 bg-danger-soft px-2 py-0.5 text-xs font-medium text-danger"
                      }
                    >
                      {sd.skillName}
                      {sd.requiredLevel
                        ? ` · req. ${skillLevelLabels[sd.requiredLevel]}`
                        : ""}
                      {sd.currentLevel
                        ? ` · tem ${skillLevelLabels[sd.currentLevel]}`
                        : " · não possui"}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-xs text-medium">
            Nenhum candidato disponível sobrou para esta frente. Amplie o escopo
            para todos os consultores ou reduza o número de frentes paralelas.
          </p>
        )}

        {/* Troca manual */}
        {options.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
            <label className="flex min-w-56 flex-1 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Trocar quem ocupa esta frente
              </span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) onSwap(slot.key, e.target.value);
                }}
                className={cn(
                  "h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-strong",
                  focusRingInput,
                )}
              >
                <option value="">— Escolher outra pessoa —</option>
                {options.map((c) => (
                  <option key={c.consultantId} value={c.consultantId}>
                    {c.consultantName} · {c.slotScore}/100 · {c.fit.skillsMet}/
                    {c.fit.skillsRequired} skills
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-soft">
                <ArrowLeftRight
                  aria-hidden="true"
                  className="mr-1 inline size-3.5"
                />
                Trocar por alguém de outra frente inverte as duas.
              </span>
              {assigned ? (
                <ActionButton
                  variant="secondary"
                  size="sm"
                  icon={UserX}
                  onClick={() => onClear(slot.key)}
                >
                  Esvaziar
                </ActionButton>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
