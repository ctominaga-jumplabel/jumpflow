"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Mail, Star } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { Modal } from "@/components/ui/Modal";
import { StatTile } from "@/components/ui/StatTile";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { contractTypeLabels, seniorityLabels } from "@/lib/consultants/labels";
import type { ConsultantSeniority } from "@/lib/consultants/schemas";
import { skillLevelLabels } from "@/lib/competencies/types";
import { focusRing, opsLabel, quietPanel } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type { CoeContractType, CoeMemberView } from "@/lib/coe/types";

export interface CoeOverviewPanelProps {
  members: CoeMemberView[];
  /** Leva para a composição de time (aba de trabalho detalhada). */
  onCompose: () => void;
}

const CONTRACT_ORDER: CoeContractType[] = ["CLT", "CLT_FLEX", "PJ"];

function seniorityLabel(value: string): string {
  return seniorityLabels[value as ConsultantSeniority] ?? value;
}

/**
 * Leitura de disponibilidade HOJE, derivada das alocações vigentes. Texto
 * sempre presente — a cor só reforça (WCAG 1.4.1).
 */
function availabilityOf(member: CoeMemberView): {
  label: string;
  tone: StatusTone;
  free: boolean;
} {
  if (member.status === "ON_LEAVE") {
    return { label: "Afastado", tone: "warning", free: false };
  }
  if (member.allocatedPercent <= 0) {
    return { label: "Livre", tone: "success", free: true };
  }
  if (member.allocatedPercent < 100) {
    return {
      label: `${100 - member.allocatedPercent}% livre`,
      tone: "info",
      free: true,
    };
  }
  return { label: "Alocado", tone: "neutral", free: false };
}

function ContractTag({ value }: { value: CoeContractType | null }) {
  if (!value) {
    return (
      <span className="text-[11px] font-medium text-soft">
        Contratação não informada
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center rounded-md border border-ink/70 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-strong"
      title="Tipo de contratação"
    >
      {contractTypeLabels[value]}
    </span>
  );
}

/**
 * Visão geral do COE: quem são as REFERÊNCIAS da Jump por área de excelência.
 *
 * Leitura comercial e estratégica — poucos números, um cartão por pessoa com o
 * essencial (área, contratação, disponibilidade, principais skills). Serve a
 * dois usos: indicar alguém para um projeto e saber a quem recorrer numa dúvida
 * interna. O detalhe (todas as skills, alocações, contato) abre sob demanda; a
 * composição de time continua na aba própria.
 */
export function CoeOverviewPanel({
  members,
  onCompose,
}: CoeOverviewPanelProps) {
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState<string | null>(null);
  const [contractFilter, setContractFilter] = useState<CoeContractType | null>(
    null,
  );
  const [selected, setSelected] = useState<CoeMemberView | null>(null);

  // Desligados não são referência: ficam só na curadoria, sinalizados.
  const references = useMemo(
    () => members.filter((m) => m.active && m.status !== "INACTIVE"),
    [members],
  );

  const areas = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of references) {
      counts.set(m.focusArea, (counts.get(m.focusArea) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) =>
      a[0].localeCompare(b[0], "pt-BR"),
    );
  }, [references]);

  const contractCounts = useMemo(() => {
    const counts: Record<CoeContractType, number> = {
      CLT: 0,
      CLT_FLEX: 0,
      PJ: 0,
    };
    for (const m of references) {
      if (m.contractType) counts[m.contractType] += 1;
    }
    return counts;
  }, [references]);

  const freeNow = references.filter((m) => availabilityOf(m).free).length;

  const term = search.trim().toLocaleLowerCase("pt-BR");
  const visible = references.filter((m) => {
    if (areaFilter && m.focusArea !== areaFilter) return false;
    if (contractFilter && m.contractType !== contractFilter) return false;
    if (!term) return true;
    return (
      m.consultantName.toLocaleLowerCase("pt-BR").includes(term) ||
      m.focusArea.toLocaleLowerCase("pt-BR").includes(term) ||
      (m.note ?? "").toLocaleLowerCase("pt-BR").includes(term) ||
      m.skills.some((s) =>
        s.skillName.toLocaleLowerCase("pt-BR").includes(term),
      )
    );
  });

  // Grade única, ordenada por área: com uma pessoa por área, seções separadas
  // deixavam uma coluna só e o resto da largura vazio.
  const sorted = [...visible].sort(
    (a, b) =>
      a.focusArea.localeCompare(b.focusArea, "pt-BR") ||
      a.consultantName.localeCompare(b.consultantName, "pt-BR"),
  );

  if (references.length === 0) {
    return (
      <div className={cn(quietPanel, "px-5 py-8")}>
        <EmptyState
          icon={Star}
          title="Ainda não há consultores de referência"
          description="Inclua consultores no núcleo pela aba Curadoria. Eles passam a aparecer aqui como referência para projetos e dúvidas internas."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Faixa executiva: quatro números, sem caixa. */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <StatTile
          align="start"
          label="Referências"
          value={String(references.length)}
          hint="consultores no núcleo"
        />
        <StatTile
          align="start"
          label="Áreas de excelência"
          value={String(areas.length)}
          hint="cobertas pelo núcleo"
        />
        <StatTile
          align="start"
          label="Com capacidade hoje"
          value={String(freeNow)}
          tone={freeNow > 0 ? "success" : "neutral"}
          hint="livres ou parcialmente livres"
        />
        <div className="grid gap-0.5">
          <span className={opsLabel}>Contratação</span>
          <dl className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {CONTRACT_ORDER.map((c) => (
              <div key={c} className="flex items-baseline gap-1.5">
                <dt className="text-xs font-semibold text-soft">
                  {contractTypeLabels[c]}
                </dt>
                <dd className="font-mono text-2xl font-semibold leading-tight tabular-nums tracking-tight text-strong">
                  {contractCounts[c]}
                </dd>
              </div>
            ))}
          </dl>
          <span className="text-xs text-soft">tipo de contratação</span>
        </div>
      </div>

      <div className="space-y-3">
        <DataToolbar
          search={{
            value: search,
            onChange: setSearch,
            placeholder: "Buscar por nome, área, skill ou assunto…",
            label: "Buscar referência",
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            tactile={false}
            label="Todas as áreas"
            active={areaFilter === null}
            onClick={() => setAreaFilter(null)}
          />
          {areas.map(([area, count]) => (
            <FilterChip
              key={area}
              tactile={false}
              label={area}
              count={count}
              active={areaFilter === area}
              onClick={() => setAreaFilter(areaFilter === area ? null : area)}
            />
          ))}
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
          {CONTRACT_ORDER.map((c) => (
            <FilterChip
              key={c}
              tactile={false}
              label={contractTypeLabels[c]}
              count={contractCounts[c] || undefined}
              active={contractFilter === c}
              onClick={() => setContractFilter(contractFilter === c ? null : c)}
            />
          ))}
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className={cn(quietPanel, "px-5 py-6")}>
          <EmptyState
            icon={Star}
            title="Nenhuma referência corresponde aos filtros"
            description="Ajuste a busca, a área ou o tipo de contratação."
          />
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3">
          {sorted.map((member) => {
            const availability = availabilityOf(member);
            return (
              <li key={member.id}>
                <button
                  type="button"
                  onClick={() => setSelected(member)}
                  className={cn(
                    quietPanel,
                    "flex h-full w-full flex-col gap-3 p-4 text-left transition-colors hover:border-ink/40",
                    focusRing,
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={cn(opsLabel, "mb-1 truncate")}>
                        {member.focusArea}
                      </p>
                      <p className="truncate text-sm font-semibold text-strong">
                        {member.consultantName}
                      </p>
                      <p className="truncate text-xs text-soft">
                        {member.jobTitle ?? "Consultor"} ·{" "}
                        {seniorityLabel(member.seniority)}
                      </p>
                    </div>
                    <ContractTag value={member.contractType} />
                  </div>
                  <p className="line-clamp-1 text-xs text-medium">
                    {member.skills.length > 0
                      ? member.skills
                          .slice(0, 3)
                          .map((s) => s.skillName)
                          .join(" · ")
                      : "Sem skills validadas"}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <StatusBadge pill tone={availability.tone}>
                      {availability.label}
                    </StatusBadge>
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-soft">
                      Ver perfil
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.consultantName ?? ""}
        description={
          selected
            ? `Referência em ${selected.focusArea} · ${selected.jobTitle ?? "Consultor"} · ${seniorityLabel(selected.seniority)}`
            : undefined
        }
        footer={
          selected ? (
            <div className="flex flex-wrap justify-end gap-2">
              <ActionButton
                variant="secondary"
                tactile={false}
                onClick={() => {
                  setSelected(null);
                  onCompose();
                }}
              >
                Compor time
              </ActionButton>
              <a
                href={`mailto:${selected.email}`}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md border border-transparent bg-ops-accent-fill px-4 text-sm font-semibold text-white hover:bg-ops-accent-fill-hover",
                  focusRing,
                )}
              >
                <Mail aria-hidden="true" className="h-4 w-4" />
                Tirar uma dúvida
              </a>
            </div>
          ) : null
        }
      >
        {selected ? <ReferenceDetail member={selected} /> : null}
      </Modal>
    </div>
  );
}

function ReferenceDetail({ member }: { member: CoeMemberView }) {
  const availability = availabilityOf(member);
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <dt className={opsLabel}>Contratação</dt>
          <dd>
            <ContractTag value={member.contractType} />
          </dd>
        </div>
        <div className="space-y-1">
          <dt className={opsLabel}>Disponibilidade hoje</dt>
          <dd>
            <StatusBadge pill tone={availability.tone}>
              {availability.label}
            </StatusBadge>
          </dd>
        </div>
        <div className="space-y-1">
          <dt className={opsLabel}>Área</dt>
          <dd className="text-sm text-strong">{member.area ?? "—"}</dd>
        </div>
        <div className="space-y-1">
          <dt className={opsLabel}>Contato</dt>
          <dd className="truncate text-sm text-strong">{member.email}</dd>
        </div>
      </dl>

      {member.note ? (
        <div className="space-y-1">
          <p className={opsLabel}>Pode ajudar com</p>
          <p className="text-sm text-medium">{member.note}</p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <p className={opsLabel}>Onde está agora</p>
        {member.currentAllocations.length > 0 ? (
          <ul className="space-y-1">
            {member.currentAllocations.map((a, index) => (
              <li
                key={`${a.projectName}-${index}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="min-w-0 truncate text-strong">
                  {a.projectName}
                  <span className="text-soft"> · {a.clientName}</span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-medium">
                  {a.percent}%
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-soft">Sem alocação vigente.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <p className={opsLabel}>Skills validadas</p>
        {member.skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {member.skills.map((s) => (
              <span
                key={s.skillId}
                className="inline-flex items-center rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs text-medium"
              >
                {s.skillName} · {skillLevelLabels[s.level]}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-soft">Nenhuma skill validada ainda.</p>
        )}
      </div>
    </div>
  );
}
