"use client";

import { useMemo, useState } from "react";
import { Grid3x3 } from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChip } from "@/components/ui/FilterChip";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  LEVEL_LABEL,
  LEVEL_ORDER,
  type DashConsultant,
  type SkillCatalogRow,
  type SkillLevelDto,
} from "@/components/talent-dashboard/types";

export interface MatrizSkillsViewProps {
  consultants: DashConsultant[];
  skillCatalog: SkillCatalogRow[];
  onOpenConsultant: (id: string) => void;
}

type Scope = "ACTIVE" | "ALL";

/**
 * Escala de intensidade por NÍVEL, 100% via tokens (funciona nos 2 temas):
 * ausência → surface-muted; e brand crescente (soft → opacidades de brand).
 * Texto: níveis claros usam text-strong / text-brand-dark; os dois mais
 * intensos usam text-white pois o preenchimento é acento sólido.
 */
const LEVEL_CELL: Record<SkillLevelDto, string> = {
  BASIC: "bg-brand-soft text-brand-dark",
  INTERMEDIATE: "bg-brand/45 text-strong",
  ADVANCED: "bg-brand/70 text-white",
  SPECIALIST: "bg-brand text-white",
};

const LEVEL_ABBR: Record<SkillLevelDto, string> = {
  BASIC: "B",
  INTERMEDIATE: "I",
  ADVANCED: "A",
  SPECIALIST: "E",
};

const TOP_OPTIONS = [8, 10, 14] as const;

export function MatrizSkillsView({
  consultants,
  skillCatalog,
  onOpenConsultant,
}: MatrizSkillsViewProps) {
  const [scope, setScope] = useState<Scope>("ACTIVE");
  const [topN, setTopN] = useState<(typeof TOP_OPTIONS)[number]>(10);

  const scopedConsultants = useMemo(
    () =>
      scope === "ACTIVE"
        ? consultants.filter((c) => c.status === "ACTIVE")
        : consultants,
    [scope, consultants],
  );

  // Top-N skills por nº de consultores (usa o count coerente com o escopo).
  const topSkills = useMemo(() => {
    return [...skillCatalog]
      .sort((a, b) => {
        const av = scope === "ACTIVE" ? a.activeConsultants : a.consultants;
        const bv = scope === "ACTIVE" ? b.activeConsultants : b.consultants;
        return bv - av;
      })
      .slice(0, topN);
  }, [skillCatalog, topN, scope]);

  const topSkillNames = useMemo(
    () => topSkills.map((s) => s.name),
    [topSkills],
  );

  // Linhas = consultores (no escopo) com ao menos 1 das skills exibidas.
  const rows = useMemo(() => {
    const nameSet = new Set(topSkillNames);
    return scopedConsultants
      .map((c) => {
        const levels = new Map<string, SkillLevelDto>();
        for (const s of c.skills) {
          if (nameSet.has(s.name)) {
            const prev = levels.get(s.name);
            // mantém o maior nível se houver duplicidade
            if (
              !prev ||
              LEVEL_ORDER.indexOf(s.level) > LEVEL_ORDER.indexOf(prev)
            ) {
              levels.set(s.name, s.level);
            }
          }
        }
        return { consultant: c, levels, coverage: levels.size };
      })
      .filter((r) => r.coverage > 0)
      .sort((a, b) => {
        if (b.coverage !== a.coverage) return b.coverage - a.coverage;
        return a.consultant.name.localeCompare(b.consultant.name, "pt-BR");
      });
  }, [scopedConsultants, topSkillNames]);

  if (skillCatalog.length === 0 || consultants.length === 0) {
    return (
      <SectionPanel
        title="Matriz de Skills"
        description="Cruzamento consultor × skill com nível de proficiência."
      >
        <div className="px-5 py-10">
          <EmptyState
            icon={Grid3x3}
            title="Sem dados para a matriz"
            description="É necessário ter consultores e skills cadastrados."
          />
        </div>
      </SectionPanel>
    );
  }

  return (
    <SectionPanel
      title="Matriz de Skills"
      description="Mapa de calor consultor × skill — intensidade = nível de proficiência."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip
            label="Somente ativos"
            active={scope === "ACTIVE"}
            onClick={() => setScope("ACTIVE")}
          />
          <FilterChip
            label="Toda a base"
            active={scope === "ALL"}
            onClick={() => setScope("ALL")}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          {TOP_OPTIONS.map((n) => (
            <FilterChip
              key={n}
              label={`Top ${n}`}
              active={topN === n}
              onClick={() => setTopN(n)}
            />
          ))}
        </div>
      }
    >
      {/* Legenda dos níveis */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-soft">
          Legenda
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-medium">
          <span className="grid size-5 place-items-center rounded border border-border bg-surface-muted text-[10px] font-semibold text-soft">
            –
          </span>
          Sem skill
        </span>
        {LEVEL_ORDER.map((lvl) => (
          <span
            key={lvl}
            className="inline-flex items-center gap-1.5 text-xs text-medium"
          >
            <span
              className={cn(
                "grid size-5 place-items-center rounded border border-ink/10 text-[10px] font-bold",
                LEVEL_CELL[lvl],
              )}
            >
              {LEVEL_ABBR[lvl]}
            </span>
            {LEVEL_LABEL[lvl]}
          </span>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-soft">
          Nenhum consultor possui as skills exibidas neste escopo.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">
              Matriz de proficiência por consultor e skill
            </caption>
            <thead>
              <tr className="border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-surface px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-soft"
                >
                  Consultor
                </th>
                {topSkills.map((s) => (
                  <th
                    key={s.name}
                    scope="col"
                    className="h-32 px-1 py-2 align-bottom"
                  >
                    <span
                      className="mx-auto block whitespace-nowrap text-left text-[11px] font-semibold text-medium [writing-mode:vertical-rl] rotate-180"
                      title={`${s.name} · ${s.consultants} consultor(es)`}
                    >
                      {s.name}
                    </span>
                  </th>
                ))}
                <th
                  scope="col"
                  className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wide text-soft"
                >
                  Cobertura
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ consultant, levels, coverage }) => (
                <tr
                  key={consultant.id}
                  onClick={() => onOpenConsultant(consultant.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpenConsultant(consultant.id);
                    }
                  }}
                  className={cn(
                    "cursor-pointer transition-colors hover:bg-surface-muted/50",
                    focusRing,
                  )}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-[16rem] truncate bg-surface px-5 py-2 text-left font-medium text-strong"
                    title={consultant.name}
                  >
                    {consultant.name}
                  </th>
                  {topSkills.map((s) => {
                    const lvl = levels.get(s.name);
                    return (
                      <td key={s.name} className="p-1 text-center">
                        <span
                          className={cn(
                            "mx-auto grid h-8 w-9 place-items-center rounded text-[11px] font-bold",
                            lvl
                              ? LEVEL_CELL[lvl]
                              : "bg-surface-muted text-soft/60",
                          )}
                          aria-label={
                            lvl
                              ? `${s.name}: ${LEVEL_LABEL[lvl]}`
                              : `${s.name}: sem skill`
                          }
                          title={
                            lvl
                              ? `${s.name} — ${LEVEL_LABEL[lvl]}`
                              : `${s.name} — sem skill`
                          }
                        >
                          {lvl ? LEVEL_ABBR[lvl] : ""}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-center text-sm font-semibold tabular-nums text-strong">
                    {coverage}
                    <span className="text-soft">/{topSkills.length}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionPanel>
  );
}
