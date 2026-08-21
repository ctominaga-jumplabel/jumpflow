"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing, focusRingInput } from "@/lib/styles";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CONTRACT_LABEL,
  NAO_INFORMADO,
  SENIORITY_LABEL,
  STATUS_LABEL,
  type ConsultantStatusDto,
  type ContractTypeDto,
  type DashConsultant,
  type SeniorityDto,
} from "@/components/talent-dashboard/types";

export interface ConsultoresViewProps {
  consultants: DashConsultant[];
  onOpenConsultant: (id: string) => void;
}

const STATUS_TONE: Record<ConsultantStatusDto, StatusTone> = {
  ACTIVE: "success",
  ON_LEAVE: "warning",
  INACTIVE: "neutral",
};

const fieldClass = cn(
  "h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm text-strong",
  focusRingInput,
);

type SortKey = "name" | "skills" | "certs";

function topSkillNames(c: DashConsultant): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of c.skills) {
    if (seen.has(s.name)) continue;
    seen.add(s.name);
    out.push(s.name);
  }
  return out;
}

export function ConsultoresView({
  consultants,
  onOpenConsultant,
}: ConsultoresViewProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"" | ConsultantStatusDto>("");
  const [contract, setContract] = useState<"" | ContractTypeDto>("");
  const [seniority, setSeniority] = useState<"" | SeniorityDto>("");
  const [sort, setSort] = useState<SortKey>("name");

  const options = useMemo(() => {
    const seniorities = new Set<SeniorityDto>();
    const contracts = new Set<ContractTypeDto>();
    for (const c of consultants) {
      if (c.seniority) seniorities.add(c.seniority);
      contracts.add(c.contractType);
    }
    return {
      seniorities: [...seniorities].sort((a, b) =>
        SENIORITY_LABEL[a].localeCompare(SENIORITY_LABEL[b], "pt-BR"),
      ),
      contracts: [...contracts].sort((a, b) =>
        CONTRACT_LABEL[a].localeCompare(CONTRACT_LABEL[b], "pt-BR"),
      ),
    };
  }, [consultants]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = consultants.filter((c) => {
      if (status && c.status !== status) return false;
      if (contract && c.contractType !== contract) return false;
      if (seniority && c.seniority !== seniority) return false;
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
    } else if (sort === "skills") {
      sorted.sort(
        (a, b) =>
          b.skillCount - a.skillCount ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
    } else {
      sorted.sort(
        (a, b) =>
          b.certValidCount - a.certValidCount ||
          a.name.localeCompare(b.name, "pt-BR"),
      );
    }
    return sorted;
  }, [consultants, query, status, contract, seniority, sort]);

  const columns: DataTableColumn<DashConsultant>[] = [
    {
      key: "consultant",
      header: "Consultor",
      cell: (c) => (
        <button
          type="button"
          onClick={() => onOpenConsultant(c.id)}
          className={cn(
            "-mx-1 flex flex-col rounded px-1 py-0.5 text-left hover:underline",
            focusRing,
          )}
        >
          <span className="font-semibold text-strong">{c.name}</span>
          <span className="text-xs text-soft">{c.email || NAO_INFORMADO}</span>
        </button>
      ),
    },
    {
      key: "contract",
      header: "Contratação",
      cell: (c) => CONTRACT_LABEL[c.contractType],
    },
    {
      key: "seniority",
      header: "Senioridade",
      cell: (c) =>
        c.seniority ? SENIORITY_LABEL[c.seniority] : NAO_INFORMADO,
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <StatusBadge tone={STATUS_TONE[c.status]}>
          {STATUS_LABEL[c.status]}
        </StatusBadge>
      ),
    },
    {
      key: "skills",
      header: "Skills",
      align: "right",
      className: "tabular-nums",
      cell: (c) => c.skillCount,
    },
    {
      key: "certs",
      header: "Certs vigentes",
      align: "right",
      className: "tabular-nums",
      cell: (c) => c.certValidCount,
    },
    {
      key: "topSkills",
      header: "Principais skills",
      className: "hidden lg:table-cell",
      cell: (c) => {
        const names = topSkillNames(c);
        const shown = names.slice(0, 4);
        const extra = names.length - shown.length;
        if (shown.length === 0) {
          return <span className="text-soft">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {shown.map((n) => (
              <StatusBadge key={n} tone="neutral">
                {n}
              </StatusBadge>
            ))}
            {extra > 0 ? (
              <StatusBadge tone="neutral">+{extra}</StatusBadge>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <SectionPanel
      title="Consultores"
      description="Diretório da base com contratação, senioridade, skills e certificações."
    >
      <div className="space-y-4 px-5 py-5">
        <DataToolbar
          search={{
            value: query,
            onChange: setQuery,
            placeholder: "Buscar por nome ou e-mail",
            label: "Buscar consultores",
          }}
          filters={
            <>
              <label className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-medium">
                  Status
                </span>
                <select
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as "" | ConsultantStatusDto)
                  }
                  className={cn(fieldClass, "w-auto")}
                >
                  <option value="">Todos</option>
                  <option value="ACTIVE">{STATUS_LABEL.ACTIVE}</option>
                  <option value="ON_LEAVE">{STATUS_LABEL.ON_LEAVE}</option>
                  <option value="INACTIVE">{STATUS_LABEL.INACTIVE}</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-medium">
                  Contratação
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
              <label className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-medium">
                  Senioridade
                </span>
                <select
                  value={seniority}
                  onChange={(e) =>
                    setSeniority(e.target.value as "" | SeniorityDto)
                  }
                  className={cn(fieldClass, "w-auto")}
                >
                  <option value="">Todas</option>
                  {options.seniorities.map((s) => (
                    <option key={s} value={s}>
                      {SENIORITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </>
          }
          actions={
            <label className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-medium">Ordenar</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className={cn(fieldClass, "w-auto")}
              >
                <option value="name">Nome</option>
                <option value="skills">Nº de skills</option>
                <option value="certs">Nº de certificados</option>
              </select>
            </label>
          }
        />

        <p className="text-sm text-medium">
          <span className="font-semibold text-strong">{rows.length}</span> de{" "}
          {consultants.length} consultores
        </p>

        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          caption="Diretório de consultores"
          empty={
            <EmptyState
              icon={Users}
              title="Nenhum consultor encontrado"
              description="Ajuste a busca ou os filtros para ver a base."
            />
          }
        />
      </div>
    </SectionPanel>
  );
}
