"use client";

import { useMemo, useState } from "react";
import { Sparkles, ShieldCheck, AlertTriangle } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { FilterChip } from "@/components/ui/FilterChip";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  STATUS_LABEL,
  VALIDATION_LABEL,
  type ConsultantStatusDto,
  type DashConsultant,
  type SkillCatalogRow,
  type SkillLevelDto,
  type SkillTypeDto,
  type ValidationStatusDto,
} from "@/components/talent-dashboard/types";

export interface SkillsViewProps {
  skillCatalog: SkillCatalogRow[];
  consultants: DashConsultant[];
  onOpenConsultant: (id: string) => void;
}

type TypeFilter = "ALL" | SkillTypeDto;

const LEVEL_TONE: Record<SkillLevelDto, StatusTone> = {
  BASIC: "neutral",
  INTERMEDIATE: "info",
  ADVANCED: "info",
  SPECIALIST: "success",
};

const VALIDATION_TONE: Record<ValidationStatusDto, StatusTone> = {
  VALIDATED: "success",
  PENDING: "warning",
  REJECTED: "danger",
};

const STATUS_TONE: Record<ConsultantStatusDto, StatusTone> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  ON_LEAVE: "warning",
};

/** Horizontal token-based bar row (trilho bg-surface-muted + fill bg-brand). */
function BarRow({
  label,
  value,
  max,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  hint?: string;
}) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-40 shrink-0 truncate text-xs font-medium text-medium" title={label}>
        {label}
      </span>
      <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-brand"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-strong">
        {value}
        {hint ? <span className="ml-1 font-normal text-soft">{hint}</span> : null}
      </span>
    </div>
  );
}

export function SkillsView({
  skillCatalog,
  consultants,
  onOpenConsultant,
}: SkillsViewProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");

  // Consultores distintos por categoria de skill (não conta vínculos: conta gente).
  const categoryBars = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const c of consultants) {
      const seen = new Set<string>();
      for (const s of c.skills) {
        if (seen.has(s.category)) continue;
        seen.add(s.category);
        if (!map.has(s.category)) map.set(s.category, new Set());
        map.get(s.category)!.add(c.id);
      }
    }
    return Array.from(map.entries())
      .map(([label, ids]) => ({ label, value: ids.size }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [consultants]);

  // Técnica vs Comportamental — consultores distintos com ao menos 1 do tipo.
  const typeBars = useMemo(() => {
    let tech = 0;
    let behavioral = 0;
    for (const c of consultants) {
      if (c.skills.some((s) => s.type === "TECHNICAL")) tech += 1;
      if (c.skills.some((s) => s.type === "BEHAVIORAL")) behavioral += 1;
    }
    return [
      { label: "Técnica", value: tech },
      { label: "Comportamental", value: behavioral },
    ];
  }, [consultants]);

  const filteredCatalog = useMemo(() => {
    const rows =
      typeFilter === "ALL"
        ? skillCatalog
        : skillCatalog.filter((s) => s.type === typeFilter);
    return [...rows].sort((a, b) => b.consultants - a.consultants);
  }, [skillCatalog, typeFilter]);

  // Lacunas: skills com poucos consultores ATIVOS (≤2).
  const gaps = useMemo(
    () =>
      [...skillCatalog]
        .filter((s) => s.activeConsultants <= 2)
        .sort((a, b) => a.activeConsultants - b.activeConsultants)
        .slice(0, 12),
    [skillCatalog],
  );

  const [selectedName, setSelectedName] = useState<string | null>(
    filteredCatalog[0]?.name ?? null,
  );

  const selected = useMemo(() => {
    const inList = filteredCatalog.find((s) => s.name === selectedName);
    return inList ?? filteredCatalog[0] ?? null;
  }, [filteredCatalog, selectedName]);

  // Consultores que têm a skill selecionada (com seu nível naquela skill).
  const selectedConsultants = useMemo(() => {
    if (!selected) return [];
    const rows: {
      id: string;
      name: string;
      level: SkillLevelDto;
      validation: ValidationStatusDto;
      status: ConsultantStatusDto;
    }[] = [];
    for (const c of consultants) {
      const s = c.skills.find((x) => x.name === selected.name);
      if (!s) continue;
      rows.push({
        id: c.id,
        name: c.name,
        level: s.level,
        validation: s.validation,
        status: c.status,
      });
    }
    return rows.sort((a, b) => {
      const d = LEVEL_ORDER.indexOf(b.level) - LEVEL_ORDER.indexOf(a.level);
      return d !== 0 ? d : a.name.localeCompare(b.name, "pt-BR");
    });
  }, [selected, consultants]);

  const maxCategory = Math.max(1, ...categoryBars.map((b) => b.value));
  const maxType = Math.max(1, ...typeBars.map((b) => b.value));
  const maxCatalog = Math.max(1, ...filteredCatalog.map((s) => s.consultants));
  const maxLevel = selected
    ? Math.max(1, ...LEVEL_ORDER.map((l) => selected.byLevel[l] ?? 0))
    : 1;

  if (skillCatalog.length === 0) {
    return (
      <SectionPanel
        title="Skills"
        description="Catálogo de skills com nível, validação e cobertura da base."
      >
        <div className="px-5 py-10">
          <EmptyState
            icon={Sparkles}
            title="Nenhuma skill cadastrada"
            description="Ainda não há competências com vínculos na base."
          />
        </div>
      </SectionPanel>
    );
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-border bg-surface-muted px-4 py-2.5 text-xs leading-relaxed text-medium">
        Cada skill é uma <strong className="text-strong">competência real</strong>,
        com nível de proficiência e status de validação — não é derivada de texto de
        currículo.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionPanel
          title="Consultores por categoria"
          description="Pessoas distintas com ao menos uma skill da categoria."
        >
          <div className="space-y-3 px-5 py-4">
            {categoryBars.length === 0 ? (
              <p className="text-sm text-soft">Sem dados de categoria.</p>
            ) : (
              categoryBars.map((b) => (
                <BarRow key={b.label} label={b.label} value={b.value} max={maxCategory} />
              ))
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          title="Técnica vs Comportamental"
          description="Cobertura por natureza da competência."
        >
          <div className="space-y-3 px-5 py-4">
            {typeBars.map((b) => (
              <BarRow key={b.label} label={b.label} value={b.value} max={maxType} />
            ))}
          </div>
        </SectionPanel>
      </div>

      {gaps.length > 0 ? (
        <SectionPanel
          title="Lacunas de cobertura"
          description="Skills com no máximo 2 consultores ativos — risco de dependência."
        >
          <div className="flex flex-wrap gap-2 px-5 py-4">
            {gaps.map((s) => (
              <span
                key={s.name}
                className="inline-flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning"
              >
                <AlertTriangle aria-hidden="true" className="size-3.5" />
                {s.name}
                <span className="font-normal">· {s.activeConsultants} ativo(s)</span>
              </span>
            ))}
          </div>
        </SectionPanel>
      ) : null}

      <SectionPanel
        title="Catálogo de skills"
        description="Selecione uma skill para ver níveis e consultores."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              label="Todas"
              active={typeFilter === "ALL"}
              onClick={() => setTypeFilter("ALL")}
            />
            <FilterChip
              label="Técnica"
              active={typeFilter === "TECHNICAL"}
              onClick={() => setTypeFilter("TECHNICAL")}
            />
            <FilterChip
              label="Comportamental"
              active={typeFilter === "BEHAVIORAL"}
              onClick={() => setTypeFilter("BEHAVIORAL")}
            />
          </div>
        }
      >
        <div className="grid gap-0 lg:grid-cols-[1.3fr_1fr]">
          {/* Lista de skills */}
          <div className="max-h-[32rem] overflow-y-auto border-b-2 border-ink lg:border-b-0 lg:border-r-2">
            {filteredCatalog.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-soft">
                Nenhuma skill para este filtro.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredCatalog.map((s) => {
                  const isSel = selected?.name === s.name;
                  return (
                    <li key={s.name}>
                      <button
                        type="button"
                        aria-pressed={isSel}
                        onClick={() => setSelectedName(s.name)}
                        className={cn(
                          "w-full px-5 py-3 text-left transition-colors",
                          focusRing,
                          isSel
                            ? "bg-brand-soft"
                            : "hover:bg-surface-muted/60",
                        )}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span
                            className={cn(
                              "min-w-0 truncate text-sm font-semibold",
                              isSel ? "text-brand-dark" : "text-strong",
                            )}
                            title={s.name}
                          >
                            {s.name}
                          </span>
                          <span className="shrink-0 text-xs font-semibold tabular-nums text-strong">
                            {s.consultants}
                            <span className="ml-1 font-normal text-soft">
                              · {s.activeConsultants} ativo(s)
                            </span>
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2">
                          <span className="text-[11px] uppercase tracking-wide text-soft">
                            {s.category} ·{" "}
                            {s.type === "TECHNICAL" ? "Técnica" : "Comportamental"}
                          </span>
                        </div>
                        <span className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                          <span
                            className="rounded-full bg-brand"
                            style={{
                              width: `${Math.max(
                                2,
                                Math.round((s.consultants / maxCatalog) * 100),
                              )}%`,
                            }}
                          />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detalhe da skill selecionada */}
          <div className="px-5 py-4">
            {selected ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-strong">
                    {selected.name}
                  </h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-soft">
                    <ShieldCheck aria-hidden="true" className="size-3.5" />
                    {selected.validated} vínculo(s) validado(s) de{" "}
                    {selected.consultants}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-soft">
                    Distribuição por nível
                  </p>
                  <div className="space-y-2">
                    {LEVEL_ORDER.map((lvl) => (
                      <BarRow
                        key={lvl}
                        label={LEVEL_LABEL[lvl]}
                        value={selected.byLevel[lvl] ?? 0}
                        max={maxLevel}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-soft">
                    Consultores com esta skill
                  </p>
                  <ul className="max-h-64 space-y-1 overflow-y-auto">
                    {selectedConsultants.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onOpenConsultant(c.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted",
                            focusRing,
                          )}
                        >
                          <span className="min-w-0 truncate text-sm font-medium text-strong">
                            {c.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <StatusBadge tone={LEVEL_TONE[c.level]}>
                              {LEVEL_LABEL[c.level]}
                            </StatusBadge>
                            {c.validation !== "VALIDATED" ? (
                              <StatusBadge tone={VALIDATION_TONE[c.validation]}>
                                {VALIDATION_LABEL[c.validation]}
                              </StatusBadge>
                            ) : null}
                            <StatusBadge tone={STATUS_TONE[c.status]}>
                              {STATUS_LABEL[c.status]}
                            </StatusBadge>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-soft">
                Selecione uma skill à esquerda.
              </p>
            )}
          </div>
        </div>
      </SectionPanel>
    </div>
  );
}
