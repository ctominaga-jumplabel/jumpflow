"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Sparkles, Target, Users } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  availabilityStateLabels,
  type AvailabilityState,
} from "@/lib/availability/types";
import type { StatusTone } from "@/components/ui/StatusBadge";
import type {
  AllocationProjectOption,
  AllocationSkillOption,
} from "@/lib/allocation-ai/types";
import type { AllocationFitResultBundle } from "@/lib/db/allocation-ai";
import { CandidateCard } from "./CandidateCard";

const availabilityTone: Record<AvailabilityState, StatusTone> = {
  FREE: "success",
  BENCH: "success",
  PARTIAL: "warning",
  FULL: "danger",
  VACATION: "neutral",
  ON_LEAVE: "neutral",
  INACTIVE: "neutral",
};

export interface AllocationFitViewProps {
  projects: AllocationProjectOption[];
  skillOptions: AllocationSkillOption[];
  selectedProjectId: string | null;
  selectedSkillIds: string[];
  periodStart: string | null;
  weeks: number;
  bundle: AllocationFitResultBundle | null;
  queryError: string | null;
  financialIncluded: boolean;
  aiEnabled: boolean;
  aiProviderReady: boolean;
}

/**
 * Orquestrador da IA de Alocação (§8.2). Um formulário de alvo (projeto e/ou
 * skills + período) atualiza a URL (search params), e o servidor recalcula o
 * ranking determinístico com RBAC já aplicado. Cada candidato mostra score e o
 * BREAKDOWN transparente por fator. O botão "Explicar com IA" só aparece com a
 * flag ligada; sem provider real, sinaliza "indisponível". A decisão é humana —
 * a tela deixa claro que a IA é sugestão e não cria alocação.
 */
export function AllocationFitView({
  projects,
  skillOptions,
  selectedProjectId,
  selectedSkillIds,
  periodStart,
  weeks,
  bundle,
  queryError,
  financialIncluded,
  aiEnabled,
  aiProviderReady,
}: AllocationFitViewProps) {
  const router = useRouter();
  const currentParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [projectId, setProjectId] = useState(selectedProjectId ?? "");
  const [skills, setSkills] = useState<string[]>(selectedSkillIds);
  const [period, setPeriod] = useState(periodStart ?? "");
  const [weeksValue, setWeeksValue] = useState(String(weeks));

  const skillNameById = useMemo(
    () => new Map(skillOptions.map((s) => [s.id, s.name])),
    [skillOptions],
  );

  function submit() {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    for (const id of skills) params.append("skill", id);
    if (period) params.set("periodStart", period);
    if (weeksValue) params.set("weeks", weeksValue);
    startTransition(() => {
      router.replace(`/app/alocacao-ia?${params.toString()}`);
    });
  }

  function toggleSkill(id: string) {
    setSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  const hasQuery = currentParams.toString().length > 0;

  return (
    <div className="space-y-6">
      {/* Alvo da alocação */}
      <SectionPanel
        title="Alvo da alocação"
        description="Selecione um projeto (deriva skills e cliente das alocações) e/ou informe skills, e um período opcional para a disponibilidade."
      >
        <div className="space-y-5 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Projeto
              </span>
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                className="h-10 rounded-md border-2 border-ink bg-surface px-3 text-sm text-strong"
              >
                <option value="">— Nenhum —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.clientName}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                  Início do período
                </span>
                <input
                  type="date"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="h-10 rounded-md border-2 border-ink bg-surface px-3 text-sm text-strong"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                  Semanas
                </span>
                <input
                  type="number"
                  min={1}
                  max={26}
                  value={weeksValue}
                  onChange={(e) => setWeeksValue(e.target.value)}
                  className="h-10 rounded-md border-2 border-ink bg-surface px-3 text-sm text-strong"
                />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-soft">
              Skills exigidas
            </span>
            {skillOptions.length === 0 ? (
              <p className="text-xs text-soft">
                Nenhuma skill no catálogo. Selecione um projeto para derivar as
                skills das suas alocações.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {skillOptions.map((s) => {
                  const active = skills.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSkill(s.id)}
                      aria-pressed={active}
                      className={
                        active
                          ? "rounded-md border-2 border-ink bg-brand px-3 py-1 text-xs font-semibold text-white shadow-[2px_2px_0_0_var(--color-ink)]"
                          : "rounded-md border-2 border-ink bg-surface px-3 py-1 text-xs font-semibold text-strong"
                      }
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            {queryError ? (
              <p className="text-xs font-medium text-danger">{queryError}</p>
            ) : (
              <span />
            )}
            <ActionButton icon={Target} onClick={submit} disabled={isPending}>
              {isPending ? "Calculando…" : "Calcular ranking"}
            </ActionButton>
          </div>
        </div>
      </SectionPanel>

      {/* Aviso de governança */}
      <p className="rounded-md border-2 border-ink bg-marker/60 px-3 py-2 text-xs font-medium text-ink">
        A IA é uma <strong>sugestão</strong> com fatores transparentes. A decisão
        de alocar é sempre <strong>humana</strong>; esta tela não cria alocações.
        {financialIncluded
          ? " O encaixe financeiro entra no score (você tem perfil financeiro)."
          : " O encaixe financeiro não entra no score (perfil sem acesso a custo/valor)."}
      </p>

      {/* Resultado */}
      {!hasQuery || !bundle ? (
        <EmptyState
          icon={Users}
          title="Defina o alvo da alocação"
          description="Escolha um projeto ou skills e clique em calcular para ver o ranking de consultores com o breakdown de cada fator."
        />
      ) : bundle.results.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nenhum candidato encontrado"
          description="Não há consultores ativos para o alvo informado. Ajuste as skills ou o período."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-soft">
            {bundle.fromMock ? (
              <StatusBadge tone="warning">Dados de exemplo (sem banco)</StatusBadge>
            ) : null}
            {bundle.projectName ? (
              <StatusBadge tone="info">{bundle.projectName}</StatusBadge>
            ) : null}
            {bundle.clientName ? (
              <span>Cliente: {bundle.clientName}</span>
            ) : null}
            {bundle.periodLabel ? (
              <span>Período: {bundle.periodLabel}</span>
            ) : null}
            {bundle.requiredSkills.length > 0 ? (
              <span>
                Skills exigidas:{" "}
                {bundle.requiredSkills
                  .map((s) => skillNameById.get(s.skillId) ?? s.skillName)
                  .join(", ")}
              </span>
            ) : (
              <span>Sem skills exigidas (ranking por disponibilidade/histórico).</span>
            )}
          </div>

          <ul className="space-y-4">
            {bundle.results.map((result, index) => (
              <li key={result.consultantId}>
                <CandidateCard
                  result={result}
                  rank={index + 1}
                  availabilityTone={
                    result.availabilityState
                      ? availabilityTone[result.availabilityState]
                      : "neutral"
                  }
                  availabilityLabel={
                    result.availabilityState
                      ? availabilityStateLabels[result.availabilityState]
                      : "Sem período"
                  }
                  aiEnabled={aiEnabled}
                  aiProviderReady={aiProviderReady}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {aiEnabled && !aiProviderReady ? (
        <p className="text-xs text-soft">
          <Sparkles aria-hidden="true" className="mr-1 inline size-3.5" />
          Explicação por IA habilitada por flag, mas o provedor não está
          configurado — a explicação aparece como indisponível e o ranking
          determinístico permanece intacto.
        </p>
      ) : null}
    </div>
  );
}
