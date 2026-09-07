"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarRange,
  Layers,
  Save,
  Target,
  TriangleAlert,
  Users,
} from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { MetricCard } from "@/components/ui/MetricCard";
import { Modal } from "@/components/ui/Modal";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { CoeSlotCard } from "@/components/coe/CoeSlotCard";
import { skillLevelLabels } from "@/lib/competencies/types";
import { focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  aggregateCapacity,
  aggregateSkillCoverage,
  applyManualAssignment,
  assignedMembers,
  clearAssignment,
} from "@/lib/coe/engine";
import { coeScopeLabels, type CoeScope } from "@/lib/coe/types";
import type { CoeCompositionBundle } from "@/lib/coe/types";
import type { CoeCompositionQueryInput } from "@/lib/coe/schemas";
import type {
  AllocationProjectOption,
  AllocationSkillOption,
} from "@/lib/allocation-ai/types";
import { saveCoeSquad } from "@/app/app/coe/actions";

export interface CoeCompositionPanelProps {
  bundle: CoeCompositionBundle;
  query: CoeCompositionQueryInput;
  projects: AllocationProjectOption[];
  skillOptions: AllocationSkillOption[];
  canPropose: boolean;
}

const fieldClass = cn(
  "h-10 w-full rounded-md border-2 border-ink bg-surface px-3 text-sm text-strong",
  focusRingInput,
);

/**
 * Composição de time do COE: distribui o núcleo pelas frentes paralelas de um
 * projeto e mostra o que só a leitura do CONJUNTO revela — cobertura de skills
 * do time e capacidade agregada por semana.
 *
 * A composição inicial vem do servidor. As trocas manuais rodam a MESMA engine
 * pura no cliente, então cobertura e capacidade se refazem na hora, sem
 * roundtrip e sem uma segunda implementação da regra. Salvar grava apenas a
 * PROPOSTA: nenhuma alocação é criada aqui.
 */
export function CoeCompositionPanel({
  bundle,
  query,
  projects,
  skillOptions,
  canPropose,
}: CoeCompositionPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const { feedback, notify } = useFeedback();

  // Formulário do alvo.
  const [projectId, setProjectId] = useState(query.projectId ?? "");
  const [scope, setScope] = useState<CoeScope>(query.scope);
  const [periodStart, setPeriodStart] = useState(query.periodStart ?? "");
  const [weeks, setWeeks] = useState(String(query.weeks));
  const [manualSlots, setManualSlots] = useState(String(query.manualSlots));
  const [skills, setSkills] = useState<string[]>(query.skills);

  // Composição editável. Quando o servidor devolve um bundle novo (nova busca),
  // a edição local é descartada — a base recalculada é a verdade.
  const [composition, setComposition] = useState(bundle.composition);
  const [sourceBundle, setSourceBundle] = useState(bundle);
  if (sourceBundle !== bundle) {
    setSourceBundle(bundle);
    setComposition(bundle.composition);
  }

  const [saveOpen, setSaveOpen] = useState(false);
  const [squadName, setSquadName] = useState("");
  const [squadNote, setSquadNote] = useState("");

  const members = useMemo(() => assignedMembers(composition), [composition]);
  const coverage = useMemo(
    () => aggregateSkillCoverage(bundle.requiredSkills, members),
    [bundle.requiredSkills, members],
  );
  const capacity = useMemo(
    () => aggregateCapacity(members, bundle.availabilityRows, bundle.periods),
    [members, bundle.availabilityRows, bundle.periods],
  );

  function submit() {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    params.set("scope", scope);
    for (const id of skills) params.append("skill", id);
    if (periodStart) params.set("periodStart", periodStart);
    params.set("weeks", weeks);
    params.set("manualSlots", manualSlots);
    startTransition(() => {
      router.replace(`/app/coe?${params.toString()}`);
    });
  }

  function toggleSkill(id: string) {
    setSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function handleSwap(slotKey: string, consultantId: string) {
    setComposition((prev) =>
      applyManualAssignment(prev, slotKey, consultantId),
    );
  }

  function handleClear(slotKey: string) {
    setComposition((prev) => clearAssignment(prev, slotKey));
  }

  function submitSave() {
    if (!bundle.projectId) return;
    const payloadMembers = composition.assignments
      .filter((a) => a.assigned !== null)
      .map((a) => ({
        consultantId: a.assigned!.consultantId,
        slotKey: a.slot.key,
        slotLabel: a.slot.label,
        slotScore: a.assigned!.slotScore,
      }));
    startSaving(async () => {
      const res = await saveCoeSquad({
        projectId: bundle.projectId!,
        name: squadName,
        // A janela gravada é a que o servidor REALMENTE usou para pontuar
        // (`bundle.periods`), não o que está no formulário: o campo pode ter
        // sido mexido sem recompor, e uma proposta com janela diferente da que
        // gerou os scores seria um registro mentiroso.
        periodStart: bundle.periods[0]?.start ?? null,
        weeks: bundle.periods.length || 4,
        note: squadNote.trim() ? squadNote : null,
        members: payloadMembers,
      });
      if (res.ok) {
        notify(
          "success",
          "Proposta salva. Ela não cria alocação — a alocação continua no módulo de Projetos.",
        );
        setSaveOpen(false);
        setSquadName("");
        setSquadNote("");
      } else {
        notify("warning", res.message);
      }
    });
  }

  const hasSlots = composition.assignments.length > 0;
  const filled = members.length;

  return (
    <div className="space-y-5">
      <FeedbackBanner message={feedback} />

      {/* Alvo da composição */}
      <SectionPanel
        title="Frentes a paralelizar"
        description="Selecione o projeto. As frentes vêm dos perfis planejados (cargo, senioridade e quantidade); quando o projeto não os tem, informe quantas frentes genéricas quer compor."
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
                className={fieldClass}
              >
                <option value="">— Selecione —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.clientName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Universo de candidatos
              </span>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as CoeScope)}
                className={fieldClass}
              >
                {(["COE", "ALL"] as CoeScope[]).map((value) => (
                  <option key={value} value={value}>
                    {coeScopeLabels[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Início do período
              </span>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className={fieldClass}
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
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Frentes genéricas
              </span>
              <input
                type="number"
                min={1}
                max={12}
                value={manualSlots}
                onChange={(e) => setManualSlots(e.target.value)}
                className={fieldClass}
              />
              <span className="text-xs text-soft">
                Usado só quando o projeto não tem perfis planejados.
              </span>
            </label>
          </div>

          {skillOptions.length > 0 ? (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-soft">
                Skills exigidas adicionais
              </span>
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
                          ? "rounded-md border-2 border-ink bg-brand-fill px-3 py-1 text-xs font-semibold text-white shadow-[2px_2px_0_0_var(--color-ink)]"
                          : "rounded-md border-2 border-ink bg-surface px-3 py-1 text-xs font-semibold text-strong"
                      }
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-end">
            <ActionButton icon={Target} onClick={submit} disabled={isPending}>
              {isPending ? "Compondo…" : "Compor time"}
            </ActionButton>
          </div>
        </div>
      </SectionPanel>

      {/* Governança + avisos honestos */}
      <div className="space-y-2">
        <p className="rounded-md border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand-dark">
          A composição é uma SUGESTÃO determinística: ela distribui as pessoas
          pelas frentes sem repetir ninguém e mostra o porquê de cada escolha.
          Ela não cria alocação — a alocação continua sendo decisão humana no
          módulo de Projetos.
        </p>
        {bundle.fromMock ? (
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
            Banco não configurado: os dados abaixo são de demonstração.
          </p>
        ) : null}
        {bundle.notice ? (
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
            <TriangleAlert
              aria-hidden="true"
              className="mr-1 inline size-3.5"
            />
            {bundle.notice}
          </p>
        ) : null}
        {bundle.scope === "COE" && bundle.coePoolSize === 0 ? (
          <p className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-warning">
            O núcleo do COE está vazio. Cure o núcleo na aba “Núcleo” ou mude o
            universo para todos os consultores.
          </p>
        ) : null}
        {composition.unfilled > 0 ? (
          <p className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger">
            {composition.unfilled} frente(s) sem candidato: o universo escolhido
            ({bundle.candidatePoolSize} pessoa(s)) não cobre a paralelização
            pretendida.
          </p>
        ) : null}
      </div>

      {!hasSlots ? (
        <SectionPanel title="Composição do time">
          <div className="px-5 py-6">
            <EmptyState
              icon={Layers}
              title="Selecione um projeto para compor o time"
              description="As frentes a paralelizar são derivadas do projeto — dos perfis planejados quando existem, ou de frentes genéricas informadas acima."
            />
          </div>
        </SectionPanel>
      ) : (
        <>
          {/* Leitura do CONJUNTO */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Frentes cobertas"
              value={`${filled}/${composition.assignments.length}`}
              hint="Pessoas distintas, uma por frente"
              icon={Layers}
              index={0}
            />
            <MetricCard
              label="Cobertura de skills"
              value={`${coverage.covered}/${coverage.required}`}
              hint="Basta uma pessoa do time cobrir"
              icon={Target}
              index={1}
            />
            <MetricCard
              label="Capacidade livre"
              value={`${capacity.headcountEquivalent.toFixed(1)}`}
              hint={`Pessoas-integrais na janela de ${bundle.periods.length} semana(s)`}
              icon={Users}
              index={2}
            />
            <MetricCard
              label="Universo considerado"
              value={String(bundle.candidatePoolSize)}
              hint={coeScopeLabels[bundle.scope]}
              icon={CalendarRange}
              index={3}
            />
          </div>

          <SectionPanel
            title="Cobertura de skills do time"
            description="O gap do CONJUNTO que vai tocar o projeto: uma skill está coberta quando ao menos um dos escolhidos atende o nível exigido."
          >
            {coverage.required === 0 ? (
              <p className="px-5 py-4 text-xs text-soft">
                O projeto não tem skills exigidas registradas nas alocações.
                Informe skills adicionais acima para medir a cobertura.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {coverage.skills.map((s) => (
                  <li
                    key={s.skillId}
                    className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-strong">
                        {s.skillName}
                      </span>
                      <span className="ml-2 text-xs text-soft">
                        {s.requiredLevel
                          ? `exige ${skillLevelLabels[s.requiredLevel]}`
                          : "sem nível mínimo"}
                        {s.bestLevel
                          ? ` · melhor no time: ${skillLevelLabels[s.bestLevel]}`
                          : " · ninguém no time possui"}
                      </span>
                    </div>
                    {s.covered ? (
                      <StatusBadge tone="success">
                        Coberta por {s.coveredBy.join(", ")}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="danger">Descoberta</StatusBadge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </SectionPanel>

          <SectionPanel
            title="Capacidade do time por semana"
            description="Quanto sobra somando os escolhidos. Férias, afastamento e 100% alocado contam como zero — capacidade não medida nunca vira capacidade presumida."
          >
            <div className="overflow-x-auto px-5 py-4">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-soft">
                    <th scope="col" className="pb-2 pr-3 font-semibold">
                      Semana
                    </th>
                    <th scope="col" className="pb-2 pr-3 font-semibold">
                      Capacidade livre
                    </th>
                    <th scope="col" className="pb-2 pr-3 font-semibold">
                      Equivalente
                    </th>
                    <th scope="col" className="pb-2 font-semibold">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {capacity.weeks.map((w) => (
                    <tr key={w.periodKey}>
                      <th
                        scope="row"
                        className="py-2 pr-3 text-left text-xs font-medium text-medium"
                      >
                        <span title={w.label}>{w.shortLabel}</span>
                      </th>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-28 overflow-hidden rounded-full border border-ink/20 bg-surface-muted">
                            <div
                              className="h-full rounded-full bg-brand-fill"
                              style={{
                                width: `${
                                  capacity.members === 0
                                    ? 0
                                    : Math.min(
                                        100,
                                        (w.freePercent /
                                          (capacity.members * 100)) *
                                          100,
                                      )
                                }%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-medium">
                            {w.freePercent}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-xs text-medium">
                        {(w.freePercent / 100).toFixed(1)} pessoa(s)
                      </td>
                      <td className="py-2 text-xs text-soft">
                        {w.membersWithCapacity} com folga · {w.membersBlocked}{" "}
                        sem
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionPanel>

          <SectionPanel
            title="Frentes e pessoas sugeridas"
            description="Uma pessoa por frente, sem repetição. Troque quem ocupa cada frente para testar cenários — a cobertura e a capacidade acima se atualizam na hora."
            action={
              canPropose && bundle.projectId ? (
                <ActionButton
                  icon={Save}
                  size="sm"
                  onClick={() => setSaveOpen(true)}
                  disabled={filled === 0}
                >
                  Salvar proposta
                </ActionButton>
              ) : undefined
            }
          >
            <div className="grid gap-4 px-5 py-5 lg:grid-cols-2">
              {composition.assignments.map((assignment, index) => (
                <CoeSlotCard
                  key={assignment.slot.key}
                  assignment={assignment}
                  index={index}
                  onSwap={handleSwap}
                  onClear={handleClear}
                />
              ))}
            </div>
          </SectionPanel>
        </>
      )}

      {/* Salvar proposta */}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Salvar proposta de time"
        description="Guarda o cenário composto para decisão. Não cria alocação nem altera o projeto."
        footer={
          <div className="flex justify-end gap-2">
            <ActionButton
              variant="secondary"
              onClick={() => setSaveOpen(false)}
              disabled={isSaving}
            >
              Cancelar
            </ActionButton>
            <ActionButton
              icon={Save}
              onClick={submitSave}
              disabled={isSaving || squadName.trim().length < 2 || filled === 0}
            >
              {isSaving ? "Salvando…" : "Salvar"}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-soft">
            {filled} pessoa(s) em {composition.assignments.length} frente(s) ·{" "}
            {bundle.projectName ?? "projeto"}
            {bundle.clientName ? ` · ${bundle.clientName}` : ""}
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-soft">
              Nome da proposta
            </span>
            <input
              value={squadName}
              onChange={(e) => setSquadName(e.target.value)}
              placeholder="Ex.: Squad de arrancada — sprint 1"
              maxLength={120}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-soft">
              Observação (opcional)
            </span>
            <textarea
              value={squadNote}
              onChange={(e) => setSquadNote(e.target.value)}
              rows={3}
              maxLength={500}
              className={cn(
                "w-full rounded-md border-2 border-ink bg-surface px-3 py-2 text-sm text-strong",
                focusRingInput,
              )}
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
