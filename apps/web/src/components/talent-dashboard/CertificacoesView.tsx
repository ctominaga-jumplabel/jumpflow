"use client";

import { useMemo, useState } from "react";
import {
  Award,
  BadgeCheck,
  Building2,
  CalendarClock,
  ShieldX,
  ChevronRight,
} from "lucide-react";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { FilterChip } from "@/components/ui/FilterChip";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { focusRing, focusRingInput } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  CERT_EXPIRY_LABEL,
  NAO_INFORMADO,
  type CertCatalogRow,
  type CertExpiryDto,
  type DashConsultant,
} from "@/components/talent-dashboard/types";

export interface CertificacoesViewProps {
  certCatalog: CertCatalogRow[];
  consultants: DashConsultant[];
  onOpenConsultant: (id: string) => void;
}

type ExpiryFilter = "ALL" | CertExpiryDto;

const EXPIRY_TONE: Record<CertExpiryDto, StatusTone> = {
  VALID: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  NO_EXPIRY: "neutral",
};

const EXPIRY_ORDER: CertExpiryDto[] = [
  "VALID",
  "EXPIRING",
  "EXPIRED",
  "NO_EXPIRY",
];

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Barra horizontal por token (trilho bg-surface-muted + fill bg-brand). */
function BarRow({ label, value, max }: { label: string; value: number; max: number }) {
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
      <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-strong">
        {value}
      </span>
    </div>
  );
}

export function CertificacoesView({
  certCatalog,
  consultants,
  onOpenConsultant,
}: CertificacoesViewProps) {
  const [search, setSearch] = useState("");
  const [issuerFilter, setIssuerFilter] = useState<string>("ALL");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("ALL");
  const [selected, setSelected] = useState<string | null>(null);

  // KPIs derivados do catálogo.
  const kpis = useMemo(() => {
    let valid = 0;
    let expired = 0;
    const issuers = new Set<string>();
    for (const row of certCatalog) {
      valid += row.valid + row.expiring; // ainda vigentes
      expired += row.expired;
      for (const i of row.issuers) issuers.add(i);
    }
    return {
      valid,
      expired,
      credentials: certCatalog.length,
      issuers: issuers.size,
    };
  }, [certCatalog]);

  // Barras por emissor (top) — vínculos por instituição, dos consultores.
  const issuerBars = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of consultants) {
      for (const cert of c.certs) {
        const key = cert.issuer || NAO_INFORMADO;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [consultants]);

  // Barras por vigência (agregado do catálogo).
  const expiryBars = useMemo(() => {
    const acc: Record<CertExpiryDto, number> = {
      VALID: 0,
      EXPIRING: 0,
      EXPIRED: 0,
      NO_EXPIRY: 0,
    };
    for (const row of certCatalog) {
      acc.VALID += row.valid;
      acc.EXPIRING += row.expiring;
      acc.EXPIRED += row.expired;
      acc.NO_EXPIRY += row.noExpiry;
    }
    return EXPIRY_ORDER.map((k) => ({
      key: k,
      label: CERT_EXPIRY_LABEL[k],
      value: acc[k],
    }));
  }, [certCatalog]);

  const allIssuers = useMemo(() => {
    const set = new Set<string>();
    for (const row of certCatalog) for (const i of row.issuers) set.add(i);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [certCatalog]);

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return certCatalog.filter((row) => {
      if (q && !row.name.toLowerCase().includes(q)) return false;
      if (issuerFilter !== "ALL" && !row.issuers.includes(issuerFilter)) {
        return false;
      }
      if (expiryFilter !== "ALL") {
        const bucket =
          expiryFilter === "VALID"
            ? row.valid
            : expiryFilter === "EXPIRING"
              ? row.expiring
              : expiryFilter === "EXPIRED"
                ? row.expired
                : row.noExpiry;
        if (bucket <= 0) return false;
      }
      return true;
    });
  }, [certCatalog, search, issuerFilter, expiryFilter]);

  // Consultores que possuem a credencial selecionada.
  const selectedHolders = useMemo(() => {
    if (!selected) return [];
    const rows: {
      id: string;
      name: string;
      issuer: string;
      expiry: CertExpiryDto;
      expiresAt: string | null;
    }[] = [];
    for (const c of consultants) {
      const cert = c.certs.find((x) => x.name === selected);
      if (!cert) continue;
      rows.push({
        id: c.id,
        name: c.name,
        issuer: cert.issuer || NAO_INFORMADO,
        expiry: cert.expiry,
        expiresAt: cert.expiresAt,
      });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [selected, consultants]);

  const maxIssuer = Math.max(1, ...issuerBars.map((b) => b.value));
  const maxExpiry = Math.max(1, ...expiryBars.map((b) => b.value));

  const columns: DataTableColumn<CertCatalogRow>[] = [
    {
      key: "name",
      header: "Credencial",
      cell: (row) => (
        <button
          type="button"
          onClick={() =>
            setSelected((cur) => (cur === row.name ? null : row.name))
          }
          className={cn(
            "flex items-center gap-1.5 text-left font-semibold text-strong hover:text-brand-dark",
            focusRing,
          )}
          aria-expanded={selected === row.name}
        >
          <ChevronRight
            aria-hidden="true"
            className={cn(
              "size-4 shrink-0 text-soft transition-transform",
              selected === row.name && "rotate-90",
            )}
          />
          {row.name}
        </button>
      ),
    },
    {
      key: "issuer",
      header: "Emissor",
      cell: (row) =>
        row.issuers.length === 0 ? (
          <span className="text-soft">{NAO_INFORMADO}</span>
        ) : row.issuers.length === 1 ? (
          <span className="text-medium">{row.issuers[0]}</span>
        ) : (
          <span className="text-medium" title={row.issuers.join(", ")}>
            Vários ({row.issuers.length})
          </span>
        ),
    },
    {
      key: "people",
      header: "Pessoas",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-strong">{row.consultants}</span>
      ),
    },
    {
      key: "valid",
      header: "Vigentes",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-success">
          {row.valid + row.expiring}
        </span>
      ),
    },
    {
      key: "expired",
      header: "Vencidas",
      align: "right",
      cell: (row) => (
        <span
          className={cn(
            "tabular-nums",
            row.expired > 0 ? "text-danger" : "text-soft",
          )}
        >
          {row.expired}
        </span>
      ),
    },
    {
      key: "last",
      header: "Última emissão",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-medium">
          {formatDate(row.lastIssued)}
        </span>
      ),
    },
  ];

  if (certCatalog.length === 0) {
    return (
      <SectionPanel
        title="Certificações"
        description="Catálogo de credenciais com emissores e vigência."
      >
        <div className="px-5 py-10">
          <EmptyState
            icon={Award}
            title="Nenhuma certificação cadastrada"
            description="Ainda não há credenciais registradas na base."
          />
        </div>
      </SectionPanel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          index={0}
          label="Certificações vigentes"
          value={String(kpis.valid)}
          hint="Vigentes + vencendo em breve"
          icon={BadgeCheck}
        />
        <MetricCard
          index={1}
          label="Certificações vencidas"
          value={String(kpis.expired)}
          icon={ShieldX}
          valueClassName={kpis.expired > 0 ? "text-danger" : undefined}
        />
        <MetricCard
          index={2}
          label="Credenciais distintas"
          value={String(kpis.credentials)}
          icon={Award}
        />
        <MetricCard
          index={3}
          label="Emissores distintos"
          value={String(kpis.issuers)}
          icon={Building2}
        />
      </div>

      <p className="flex items-center gap-2 rounded-md border border-border bg-surface-muted px-4 py-2.5 text-xs leading-relaxed text-medium">
        <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-soft" />
        <span>
          A vigência é <strong className="text-strong">real</strong>, calculada pela
          data de validade (não presumida). &quot;Vence em breve&quot; = expira em
          até 90 dias.
        </span>
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionPanel
          title="Por emissor"
          description="Instituições com mais certificados na base."
        >
          <div className="space-y-3 px-5 py-4">
            {issuerBars.length === 0 ? (
              <p className="text-sm text-soft">Sem emissores.</p>
            ) : (
              issuerBars.map((b) => (
                <BarRow key={b.label} label={b.label} value={b.value} max={maxIssuer} />
              ))
            )}
          </div>
        </SectionPanel>

        <SectionPanel
          title="Por vigência"
          description="Distribuição de certificados por situação de validade."
        >
          <div className="space-y-3 px-5 py-4">
            {expiryBars.map((b) => (
              <BarRow key={b.key} label={b.label} value={b.value} max={maxExpiry} />
            ))}
          </div>
        </SectionPanel>
      </div>

      <SectionPanel
        title="Catálogo por credencial"
        description="Clique numa credencial para ver quem a possui."
      >
        <div className="border-b border-border px-5 py-4">
          <DataToolbar
            search={{
              value: search,
              onChange: setSearch,
              placeholder: "Buscar credencial",
              label: "Buscar credencial",
            }}
            filters={
              <>
                <select
                  value={issuerFilter}
                  onChange={(e) => setIssuerFilter(e.target.value)}
                  aria-label="Filtrar por emissor"
                  className={cn(
                    "h-10 rounded-md border border-border bg-surface px-3 text-sm text-strong",
                    focusRingInput,
                  )}
                >
                  <option value="ALL">Todos os emissores</option>
                  {allIssuers.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
                <FilterChip
                  label="Todas"
                  active={expiryFilter === "ALL"}
                  onClick={() => setExpiryFilter("ALL")}
                />
                {EXPIRY_ORDER.map((k) => (
                  <FilterChip
                    key={k}
                    label={CERT_EXPIRY_LABEL[k]}
                    active={expiryFilter === k}
                    onClick={() => setExpiryFilter(k)}
                  />
                ))}
              </>
            }
          />
        </div>

        <DataTable
          columns={columns}
          rows={filteredCatalog}
          rowKey={(row) => row.name}
          caption="Catálogo de certificações por credencial"
          empty={
            <p className="text-center text-sm text-soft">
              Nenhuma credencial para os filtros aplicados.
            </p>
          }
        />

        {selected ? (
          <div className="border-t-2 border-ink bg-surface-muted/40 px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-strong">
                Quem possui: {selected}
              </h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium text-soft hover:text-strong",
                  focusRing,
                )}
              >
                Fechar
              </button>
            </div>
            {selectedHolders.length === 0 ? (
              <p className="text-sm text-soft">
                Nenhum consultor com esta credencial.
              </p>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-2">
                {selectedHolders.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => onOpenConsultant(h.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-muted",
                        focusRing,
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-strong">
                          {h.name}
                        </span>
                        <span className="block truncate text-xs text-soft">
                          {h.issuer}
                          {h.expiresAt
                            ? ` · válido até ${formatDate(h.expiresAt)}`
                            : ""}
                        </span>
                      </span>
                      <StatusBadge tone={EXPIRY_TONE[h.expiry]}>
                        {CERT_EXPIRY_LABEL[h.expiry]}
                      </StatusBadge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </SectionPanel>
    </div>
  );
}
