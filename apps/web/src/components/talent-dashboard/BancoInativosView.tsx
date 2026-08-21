"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Award,
  ChevronRight,
  RotateCcw,
  Sparkles,
  UserMinus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { MetricCard } from "@/components/ui/MetricCard";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CERT_EXPIRY_LABEL,
  CONTRACT_LABEL,
  LEVEL_LABEL,
  NAO_INFORMADO,
  SENIORITY_LABEL,
  STATUS_LABEL,
  type CertExpiryDto,
  type ConsultantStatusDto,
  type ContractTypeDto,
  type DashCert,
  type DashConsultant,
  type DashSkill,
  type SkillLevelDto,
} from "@/components/talent-dashboard/types";

export interface BancoInativosViewProps {
  consultants: DashConsultant[];
  onOpenConsultant: (id: string) => void;
}

const STATUS_TONE: Record<ConsultantStatusDto, StatusTone> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

const LEVEL_TONE: Record<SkillLevelDto, StatusTone> = {
  BASIC: "neutral",
  INTERMEDIATE: "info",
  ADVANCED: "success",
  SPECIALIST: "info",
};

const EXPIRY_TONE: Record<CertExpiryDto, StatusTone> = {
  VALID: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  NO_EXPIRY: "neutral",
};

const fieldClass = cn(
  "h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-strong",
  focusRingInput,
);

type SortKey = "recent" | "name" | "certs";

function monthYear(iso: string | null): string {
  if (!iso) return NAO_INFORMADO;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return NAO_INFORMADO;
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

function dedupeSkills(skills: DashSkill[]): DashSkill[] {
  const seen = new Set<string>();
  const out: DashSkill[] = [];
  for (const s of skills) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s);
  }
  return out;
}

function liveCerts(certs: DashCert[]): DashCert[] {
  const seen = new Set<string>();
  const out: DashCert[] = [];
  for (const c of certs) {
    if (c.expiry === "EXPIRED") continue;
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}

export function BancoInativosView({
  consultants,
  onOpenConsultant,
}: BancoInativosViewProps) {
  const reduce = useReducedMotion();

  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("");
  const [contract, setContract] = useState<"" | ContractTypeDto>("");
  const [sort, setSort] = useState<SortKey>("recent");

  // Escopo: apenas inativos e afastados.
  const pool = useMemo(
    () => consultants.filter((c) => c.status !== "ACTIVE"),
    [consultants],
  );

  const kpis = useMemo(() => {
    const withValidCert = pool.filter((c) => c.certValidCount > 0).length;
    const findableBySkill = pool.filter((c) => c.skillCount > 0).length;
    const distinctSkills = new Set<string>();
    for (const c of pool) for (const s of c.skills) distinctSkills.add(s.name);
    return {
      total: pool.length,
      withValidCert,
      findableBySkill,
      distinctSkills: distinctSkills.size,
    };
  }, [pool]);

  const options = useMemo(() => {
    const skills = new Set<string>();
    const contracts = new Set<ContractTypeDto>();
    for (const c of pool) {
      contracts.add(c.contractType);
      for (const s of c.skills) skills.add(s.name);
    }
    return {
      skills: [...skills].sort((a, b) => a.localeCompare(b, "pt-BR")),
      contracts: [...contracts].sort((a, b) =>
        CONTRACT_LABEL[a].localeCompare(CONTRACT_LABEL[b], "pt-BR"),
      ),
    };
  }, [pool]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = pool.filter((c) => {
      if (contract && c.contractType !== contract) return false;
      if (skill && !c.skills.some((s) => s.name === skill)) return false;
      if (q) {
        const inName = c.name.toLowerCase().includes(q);
        const inEmail = c.email.toLowerCase().includes(q);
        if (!inName && !inEmail) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    } else if (sort === "certs") {
      sorted.sort(
        (a, b) =>
          b.certValidCount - a.certValidCount ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
    } else {
      // recent: por lastCertAt desc; nulos ao final.
      sorted.sort((a, b) => {
        const av = a.lastCertAt ? Date.parse(a.lastCertAt) : -Infinity;
        const bv = b.lastCertAt ? Date.parse(b.lastCertAt) : -Infinity;
        return bv - av || a.name.localeCompare(b.name, "pt-BR");
      });
    }
    return sorted;
  }, [pool, query, skill, contract, sort]);

  const hasFilter = Boolean(query || skill || contract);

  function clearAll() {
    setQuery("");
    setSkill("");
    setContract("");
  }

  return (
    <SectionPanel
      title="Banco de Inativos"
      description="Recontratação por skill: localize quem já conhece a casa."
    >
      <div className="space-y-5 px-5 py-5">
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface-muted px-4 py-3">
          <RotateCcw
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-medium"
          />
          <p className="text-sm text-medium">
            Consultores inativos ou afastados que já atuaram na Jump. Busque por
            skill ou certificação para acionar rapidamente talentos com histórico
            na casa.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            index={0}
            icon={UserMinus}
            label="Inativos e afastados"
            value={String(kpis.total)}
          />
          <MetricCard
            index={1}
            icon={Award}
            label="Com certificação vigente"
            value={String(kpis.withValidCert)}
          />
          <MetricCard
            index={2}
            icon={Users}
            label="Localizáveis por skill"
            value={String(kpis.findableBySkill)}
          />
          <MetricCard
            index={3}
            icon={Sparkles}
            label="Skills distintas no acervo"
            value={String(kpis.distinctSkills)}
          />
        </div>

        <DataToolbar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "Buscar por nome ou registro",
            label: "Buscar no banco de inativos",
          }}
          filters={
            <>
              <label className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-medium">Skill</span>
                <select
                  value={skill}
                  onChange={(e) => setSkill(e.target.value)}
                  className={cn(fieldClass, "w-auto")}
                >
                  <option value="">Todas as skills</option>
                  {options.skills.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-medium">
                  Contratação anterior
                </span>
                <select
                  value={contract}
                  onChange={(e) =>
                    setContract(e.target.value as "" | ContractTypeDto)
                  }
                  className={cn(fieldClass, "w-auto")}
                >
                  <option value="">Todas</option>
                  {options.contracts.map((c) => (
                    <option key={c} value={c}>
                      {CONTRACT_LABEL[c]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          }
          actions={
            <>
              <label className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-medium">
                  Ordenar
                </span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className={cn(fieldClass, "w-auto")}
                >
                  <option value="recent">Certificado mais recente</option>
                  <option value="name">Nome</option>
                  <option value="certs">Nº de certificados vigentes</option>
                </select>
              </label>
              {hasFilter ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
                    focusRing,
                  )}
                >
                  <X aria-hidden="true" className="size-3.5" />
                  Limpar
                </button>
              ) : null}
            </>
          }
        />

        <p className="text-sm text-medium">
          <span className="font-semibold text-strong">{results.length}</span> de{" "}
          {pool.length} no banco de inativos
        </p>

        {results.length === 0 ? (
          <EmptyState
            icon={UserMinus}
            title="Nenhum talento encontrado"
            description={
              pool.length === 0
                ? "Não há consultores inativos ou afastados na base."
                : "Ajuste a busca ou os filtros para localizar talentos anteriores."
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.map((c, i) => (
              <InativoCard
                key={c.id}
                consultant={c}
                index={i}
                reduce={Boolean(reduce)}
                onOpen={() => onOpenConsultant(c.id)}
              />
            ))}
          </div>
        )}
      </div>
    </SectionPanel>
  );
}

function InativoCard({
  consultant,
  index,
  reduce,
  onOpen,
}: {
  consultant: DashConsultant;
  index: number;
  reduce: boolean;
  onOpen: () => void;
}) {
  const subtitle = [
    consultant.jobTitle,
    consultant.seniority ? SENIORITY_LABEL[consultant.seniority] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const skills = dedupeSkills(consultant.skills);
  const shownSkills = skills.slice(0, 5);
  const extraSkills = skills.length - shownSkills.length;
  const certs = liveCerts(consultant.certs);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        ease: "easeOut",
        // Teto no stagger: com centenas de cards, index cru deixaria os últimos
        // invisíveis por muitos segundos (regra do design system: motion contido
        // no fluxo operacional).
        delay: Math.min(index, 12) * 0.03,
      }}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 text-left transition-colors hover:border-ink hover:bg-surface-muted/50",
        focusRing,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-strong">
            {consultant.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-soft">
            {subtitle || NAO_INFORMADO}
          </p>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-soft transition-transform group-hover:translate-x-0.5"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge tone={STATUS_TONE[consultant.status]}>
          {STATUS_LABEL[consultant.status]}
        </StatusBadge>
        <StatusBadge tone="neutral">
          {CONTRACT_LABEL[consultant.contractType]}
        </StatusBadge>
      </div>

      {shownSkills.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-medium">
            <Sparkles aria-hidden="true" className="size-3.5" />
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {shownSkills.map((s) => (
              <StatusBadge key={s.name} tone={LEVEL_TONE[s.level]}>
                {s.name} · {LEVEL_LABEL[s.level]}
              </StatusBadge>
            ))}
            {extraSkills > 0 ? (
              <StatusBadge tone="neutral">+{extraSkills}</StatusBadge>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-xs text-soft">Sem skills cadastradas.</p>
      )}

      {certs.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-medium">
            <Award aria-hidden="true" className="size-3.5" />
            Certificados vigentes
          </p>
          <div className="flex flex-wrap gap-1.5">
            {certs.map((c) => (
              <StatusBadge key={c.name} tone={EXPIRY_TONE[c.expiry]}>
                {c.name} · {CERT_EXPIRY_LABEL[c.expiry]}
              </StatusBadge>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-auto text-xs text-soft">
        Último certificado em {monthYear(consultant.lastCertAt)}
      </p>
    </motion.button>
  );
}
