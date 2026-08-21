"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Award, ChevronRight, Search, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CERT_EXPIRY_LABEL,
  CONTRACT_LABEL,
  LEVEL_LABEL,
  LEVEL_ORDER,
  NAO_INFORMADO,
  SENIORITY_LABEL,
  STATUS_LABEL,
  type CertExpiryDto,
  type ConsultantStatusDto,
  type ContractTypeDto,
  type DashCert,
  type DashConsultant,
  type DashSkill,
  type SeniorityDto,
  type SkillLevelDto,
  type SkillTypeDto,
} from "@/components/talent-dashboard/types";

export interface TalentFinderViewProps {
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

type CertValidity = "all" | "valid" | "expired";

/** Skill ainda vigente para o corte "vigentes" (VALID/EXPIRING/NO_EXPIRY). */
function isCertLive(expiry: CertExpiryDto): boolean {
  return expiry !== "EXPIRED";
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

function dedupeCerts(certs: DashCert[]): DashCert[] {
  const seen = new Set<string>();
  const out: DashCert[] = [];
  for (const c of certs) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
  }
  return out;
}

interface FinderHit {
  consultant: DashConsultant;
  skills: DashSkill[];
  certs: DashCert[];
}

export function TalentFinderView({
  consultants,
  onOpenConsultant,
}: TalentFinderViewProps) {
  const reduce = useReducedMotion();

  const [query, setQuery] = useState("");
  const [skill, setSkill] = useState("");
  const [minLevel, setMinLevel] = useState<"" | SkillLevelDto>("");
  const [skillType, setSkillType] = useState<"" | SkillTypeDto>("");
  const [category, setCategory] = useState("");
  const [issuer, setIssuer] = useState("");
  const [seniority, setSeniority] = useState<"" | SeniorityDto>("");
  const [contract, setContract] = useState<"" | ContractTypeDto>("");
  const [status, setStatus] = useState<"" | ConsultantStatusDto>("ACTIVE");
  const [certValidity, setCertValidity] = useState<CertValidity>("all");

  // Opções distintas presentes na base (ordenadas), para os selects.
  const options = useMemo(() => {
    const skills = new Set<string>();
    const categories = new Set<string>();
    const issuers = new Set<string>();
    const seniorities = new Set<SeniorityDto>();
    const contracts = new Set<ContractTypeDto>();
    for (const c of consultants) {
      if (c.seniority) seniorities.add(c.seniority);
      contracts.add(c.contractType);
      for (const s of c.skills) {
        skills.add(s.name);
        categories.add(s.category);
      }
      for (const ct of c.certs) issuers.add(ct.issuer);
    }
    const sortPt = (a: string, b: string) => a.localeCompare(b, "pt-BR");
    return {
      skills: [...skills].sort(sortPt),
      categories: [...categories].sort(sortPt),
      issuers: [...issuers].sort(sortPt),
      seniorities: [...seniorities].sort((a, b) =>
        SENIORITY_LABEL[a].localeCompare(SENIORITY_LABEL[b], "pt-BR"),
      ),
      contracts: [...contracts].sort((a, b) =>
        CONTRACT_LABEL[a].localeCompare(CONTRACT_LABEL[b], "pt-BR"),
      ),
    };
  }, [consultants]);

  const skillFiltersActive = Boolean(skill || minLevel || skillType || category);
  const certFiltersActive = Boolean(issuer) || certValidity !== "all";

  const results = useMemo<FinderHit[]>(() => {
    const q = query.trim().toLowerCase();

    const matchedSkills = (c: DashConsultant) =>
      c.skills.filter((s) => {
        if (skill && s.name !== skill) return false;
        if (
          minLevel &&
          LEVEL_ORDER.indexOf(s.level) < LEVEL_ORDER.indexOf(minLevel)
        )
          return false;
        if (skillType && s.type !== skillType) return false;
        if (category && s.category !== category) return false;
        return true;
      });

    const matchedCerts = (c: DashConsultant) =>
      c.certs.filter((ct) => {
        if (issuer && ct.issuer !== issuer) return false;
        if (certValidity === "valid" && !isCertLive(ct.expiry)) return false;
        if (certValidity === "expired" && ct.expiry !== "EXPIRED") return false;
        return true;
      });

    const out: FinderHit[] = [];
    for (const c of consultants) {
      if (status && c.status !== status) continue;
      if (seniority && c.seniority !== seniority) continue;
      if (contract && c.contractType !== contract) continue;

      const ms = matchedSkills(c);
      const mc = matchedCerts(c);
      if (skillFiltersActive && ms.length === 0) continue;
      if (certFiltersActive && mc.length === 0) continue;

      if (q) {
        const inName = c.name.toLowerCase().includes(q);
        const skillPool = skillFiltersActive ? ms : c.skills;
        const certPool = certFiltersActive ? mc : c.certs;
        const inSkill = skillPool.some((s) =>
          s.name.toLowerCase().includes(q),
        );
        const inCert = certPool.some((ct) =>
          ct.name.toLowerCase().includes(q),
        );
        if (!inName && !inSkill && !inCert) continue;
      }

      // Hits para exibição: casamentos estruturais + casamentos por texto.
      const textSkillHits = q
        ? c.skills.filter((s) => s.name.toLowerCase().includes(q))
        : [];
      const textCertHits = q
        ? c.certs.filter((ct) => ct.name.toLowerCase().includes(q))
        : [];
      const hitSkills = dedupeSkills([
        ...(skillFiltersActive ? ms : []),
        ...textSkillHits,
      ]);
      const hitCerts = dedupeCerts([
        ...(certFiltersActive ? mc : []),
        ...textCertHits,
      ]);

      out.push({ consultant: c, skills: hitSkills, certs: hitCerts });
    }

    out.sort((a, b) =>
      a.consultant.name.localeCompare(b.consultant.name, "pt-BR"),
    );
    return out;
  }, [
    consultants,
    query,
    skill,
    minLevel,
    skillType,
    category,
    issuer,
    seniority,
    contract,
    status,
    certValidity,
    skillFiltersActive,
    certFiltersActive,
  ]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (skill) labels.push(skill);
    if (minLevel) labels.push(`Nível ≥ ${LEVEL_LABEL[minLevel]}`);
    if (skillType)
      labels.push(skillType === "TECHNICAL" ? "Técnica" : "Comportamental");
    if (category) labels.push(category);
    if (issuer) labels.push(issuer);
    if (seniority) labels.push(SENIORITY_LABEL[seniority]);
    if (contract) labels.push(CONTRACT_LABEL[contract]);
    if (status) labels.push(STATUS_LABEL[status]);
    if (certValidity === "valid") labels.push("Cert. vigente");
    if (certValidity === "expired") labels.push("Cert. vencida");
    return labels;
  }, [
    skill,
    minLevel,
    skillType,
    category,
    issuer,
    seniority,
    contract,
    status,
    certValidity,
  ]);

  const hasAnyFilter =
    Boolean(query) ||
    skillFiltersActive ||
    certFiltersActive ||
    Boolean(seniority) ||
    Boolean(contract) ||
    status !== "ACTIVE";

  function clearAll() {
    setQuery("");
    setSkill("");
    setMinLevel("");
    setSkillType("");
    setCategory("");
    setIssuer("");
    setSeniority("");
    setContract("");
    setStatus("ACTIVE");
    setCertValidity("all");
  }

  return (
    <SectionPanel
      title="Talent Finder"
      description="Busca combinada por skill, nível, certificação, senioridade e contratação."
    >
      <div className="space-y-5 px-5 py-5">
        <DataToolbar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "Buscar por consultor, skill ou certificado",
            label: "Buscar talentos",
          }}
          actions={
            hasAnyFilter ? (
              <button
                type="button"
                onClick={clearAll}
                className={cn(
                  "inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold text-medium hover:bg-surface-muted",
                  focusRing,
                )}
              >
                <X aria-hidden="true" className="size-3.5" />
                Limpar filtros
              </button>
            ) : null
          }
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="min-w-0">
            <span className="text-xs font-semibold text-medium">Skill</span>
            <select
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              className={cn(fieldClass, "mt-1")}
            >
              <option value="">Todas as skills</option>
              {options.skills.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="text-xs font-semibold text-medium">
              Nível mínimo
            </span>
            <select
              value={minLevel}
              onChange={(e) =>
                setMinLevel(e.target.value as "" | SkillLevelDto)
              }
              className={cn(fieldClass, "mt-1")}
            >
              <option value="">Qualquer nível</option>
              {LEVEL_ORDER.map((l) => (
                <option key={l} value={l}>
                  {LEVEL_LABEL[l]}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="text-xs font-semibold text-medium">
              Tipo de skill
            </span>
            <select
              value={skillType}
              onChange={(e) =>
                setSkillType(e.target.value as "" | SkillTypeDto)
              }
              className={cn(fieldClass, "mt-1")}
            >
              <option value="">Técnica e comportamental</option>
              <option value="TECHNICAL">Técnica</option>
              <option value="BEHAVIORAL">Comportamental</option>
            </select>
          </label>

          <label className="min-w-0">
            <span className="text-xs font-semibold text-medium">Categoria</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={cn(fieldClass, "mt-1")}
            >
              <option value="">Todas as categorias</option>
              {options.categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="text-xs font-semibold text-medium">
              Emissor do certificado
            </span>
            <select
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              className={cn(fieldClass, "mt-1")}
            >
              <option value="">Todos os emissores</option>
              {options.issuers.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-0">
            <span className="text-xs font-semibold text-medium">
              Vigência do certificado
            </span>
            <select
              value={certValidity}
              onChange={(e) => setCertValidity(e.target.value as CertValidity)}
              className={cn(fieldClass, "mt-1")}
            >
              <option value="all">Todas</option>
              <option value="valid">Vigentes</option>
              <option value="expired">Vencidas</option>
            </select>
          </label>

          <label className="min-w-0">
            <span className="text-xs font-semibold text-medium">
              Senioridade
            </span>
            <select
              value={seniority}
              onChange={(e) =>
                setSeniority(e.target.value as "" | SeniorityDto)
              }
              className={cn(fieldClass, "mt-1")}
            >
              <option value="">Todas as senioridades</option>
              {options.seniorities.map((s) => (
                <option key={s} value={s}>
                  {SENIORITY_LABEL[s]}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="min-w-0">
              <span className="text-xs font-semibold text-medium">
                Contratação
              </span>
              <select
                value={contract}
                onChange={(e) =>
                  setContract(e.target.value as "" | ContractTypeDto)
                }
                className={cn(fieldClass, "mt-1")}
              >
                <option value="">Todas</option>
                {options.contracts.map((c) => (
                  <option key={c} value={c}>
                    {CONTRACT_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="text-xs font-semibold text-medium">Status</span>
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as "" | ConsultantStatusDto)
                }
                className={cn(fieldClass, "mt-1")}
              >
                <option value="">Todos</option>
                <option value="ACTIVE">{STATUS_LABEL.ACTIVE}</option>
                <option value="ON_LEAVE">{STATUS_LABEL.ON_LEAVE}</option>
                <option value="INACTIVE">{STATUS_LABEL.INACTIVE}</option>
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-medium">
          <span className="font-semibold text-strong">
            {results.length}{" "}
            {results.length === 1 ? "consultor" : "consultores"}
          </span>
          {activeFilterLabels.length > 0 ? (
            <span className="text-soft">
              · filtros: {activeFilterLabels.join(" · ")}
            </span>
          ) : (
            <span className="text-soft">· sem filtros estruturais</span>
          )}
        </div>

        {results.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Nenhum consultor encontrado"
            description="Ajuste ou limpe os filtros para ampliar a busca de talentos."
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {results.map((hit, i) => (
              <FinderCard
                key={hit.consultant.id}
                hit={hit}
                index={i}
                reduce={Boolean(reduce)}
                onOpen={() => onOpenConsultant(hit.consultant.id)}
              />
            ))}
          </div>
        )}
      </div>
    </SectionPanel>
  );
}

function FinderCard({
  hit,
  index,
  reduce,
  onOpen,
}: {
  hit: FinderHit;
  index: number;
  reduce: boolean;
  onOpen: () => void;
}) {
  const { consultant, skills, certs } = hit;
  const subtitle = [
    consultant.jobTitle,
    consultant.seniority ? SENIORITY_LABEL[consultant.seniority] : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Sem hits específicos (só filtros de consultor): mostra top skills de contexto.
  const showSkills =
    skills.length > 0 ? skills : dedupeSkills(consultant.skills).slice(0, 4);
  const extraSkills =
    skills.length === 0
      ? Math.max(0, dedupeSkills(consultant.skills).length - showSkills.length)
      : 0;

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        ease: "easeOut",
        // Teto no stagger: o Finder abre com todos os ativos (~500); index cru
        // deixaria os últimos cards invisíveis por ~15s. Motion contido no fluxo.
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

      {showSkills.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-medium">
            <Sparkles aria-hidden="true" className="size-3.5" />
            Skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {showSkills.map((s) => (
              <StatusBadge
                key={s.name}
                tone={LEVEL_TONE[s.level]}
                strong={s.level === "SPECIALIST"}
              >
                {s.name} · {LEVEL_LABEL[s.level]}
              </StatusBadge>
            ))}
            {extraSkills > 0 ? (
              <StatusBadge tone="neutral">+{extraSkills}</StatusBadge>
            ) : null}
          </div>
        </div>
      ) : null}

      {certs.length > 0 ? (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-medium">
            <Award aria-hidden="true" className="size-3.5" />
            Certificados
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
    </motion.button>
  );
}
