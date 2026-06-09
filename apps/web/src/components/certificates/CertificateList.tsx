"use client";

import { useMemo, useState } from "react";
import { Award, Plus } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { DataToolbar } from "@/components/ui/DataToolbar";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FilterChip } from "@/components/ui/FilterChip";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  certificates as allCertificates,
  expiryStatus,
  sortByUrgency,
  TODAY,
  type Certificate,
  type CertificateExpiry,
} from "@/lib/mock-data/certificates";
import { formatDate } from "@/lib/format";
import { normalize } from "@/lib/mock-data/consultants";
import { CertificateExpiryBadge } from "./CertificateExpiryBadge";

type ExpiryFilter = CertificateExpiry | "ALL";

const FILTERS: { value: ExpiryFilter; label: string }[] = [
  { value: "ALL", label: "Todos" },
  { value: "EXPIRED", label: "Vencidos" },
  { value: "EXPIRING", label: "Vencem em breve" },
  { value: "VALID", label: "Vigentes" },
];

export interface CertificateListProps {
  certificates?: Certificate[];
  referenceIso?: string;
}

/**
 * Certificate list sorted by urgency (expired → expiring → valid). Search by
 * consultant/certificate/issuer; filter by expiry status.
 */
export function CertificateList({
  certificates = allCertificates,
  referenceIso = TODAY,
}: CertificateListProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ExpiryFilter>("ALL");

  const rows = useMemo(() => {
    const term = normalize(search);
    const filtered = certificates.filter((cert) => {
      if (
        term &&
        !normalize(
          `${cert.consultantName} ${cert.name} ${cert.issuer}`,
        ).includes(term)
      ) {
        return false;
      }
      if (filter !== "ALL" && expiryStatus(cert, referenceIso) !== filter) {
        return false;
      }
      return true;
    });
    return sortByUrgency(filtered, referenceIso);
  }, [certificates, search, filter, referenceIso]);

  const columns: DataTableColumn<Certificate>[] = [
    {
      key: "certificate",
      header: "Certificado",
      cell: (c) => (
        <div>
          <p className="font-medium text-strong">{c.name}</p>
          <p className="text-xs text-soft">{c.issuer}</p>
        </div>
      ),
    },
    {
      key: "consultant",
      header: "Consultor",
      cell: (c) => <span className="text-sm">{c.consultantName}</span>,
    },
    {
      key: "issued",
      header: "Emissão",
      cell: (c) => (
        <span className="text-sm tabular-nums text-medium">
          {formatDate(c.issuedAt)}
        </span>
      ),
      className: "hidden md:table-cell",
    },
    {
      key: "expires",
      header: "Validade",
      cell: (c) => (
        <span className="text-sm tabular-nums text-medium">
          {c.expiresAt ? formatDate(c.expiresAt) : "—"}
        </span>
      ),
      className: "hidden sm:table-cell",
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => (
        <CertificateExpiryBadge certificate={c} referenceIso={referenceIso} />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <DataToolbar
        search={{
          value: search,
          onChange: setSearch,
          placeholder: "Buscar certificado, consultor ou emissor",
        }}
        filters={FILTERS.map((f) => (
          <FilterChip
            key={f.value}
            label={f.label}
            active={filter === f.value}
            onClick={() => setFilter(f.value)}
          />
        ))}
        actions={
          <ActionButton variant="primary" size="sm" icon={Plus}>
            Novo certificado
          </ActionButton>
        }
      />

      <SectionPanel
        title="Certificados"
        description={`${rows.length} ${rows.length === 1 ? "certificado" : "certificados"}`}
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id}
          caption="Lista de certificados"
          empty={
            <EmptyState
              icon={Award}
              title="Nenhum certificado encontrado"
              description="Ajuste a busca ou os filtros para ver outros certificados."
            />
          }
        />
      </SectionPanel>
    </div>
  );
}
