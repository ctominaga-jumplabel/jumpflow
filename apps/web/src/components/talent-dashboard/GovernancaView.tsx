"use client";

import {
  CalendarClock,
  ChevronRight,
  CircleCheck,
  Clock,
  FileWarning,
  Info,
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import type {
  GovItem,
  TalentGovernance,
  TalentSummary,
} from "@/components/talent-dashboard/types";

export interface GovernancaViewProps {
  governance: TalentGovernance;
  summary: TalentSummary;
  onOpenConsultant: (id: string) => void;
}

const nf = new Intl.NumberFormat("pt-BR");

/** Lista de pendências. Itens com consultantId viram botão acessível. */
function GovList({
  items,
  total,
  emptyLabel,
  onOpenConsultant,
}: {
  items: GovItem[];
  /** Total real da categoria (pode ser > items.length quando truncado). */
  total: number;
  emptyLabel: string;
  onOpenConsultant: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 px-5 py-8 text-sm text-soft">
        <CircleCheck aria-hidden="true" className="size-4 text-success" />
        {emptyLabel}
      </div>
    );
  }

  const hidden = total - items.length;
  return (
    <>
    <ul className="divide-y divide-border">
      {items.map((item, i) => {
        const content = (
          <>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-strong">
                {item.label}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-soft">
                {item.detail}
              </span>
            </span>
            {item.consultantId ? (
              <ChevronRight
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-soft"
              />
            ) : null}
          </>
        );

        if (item.consultantId) {
          const id = item.consultantId;
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onOpenConsultant(id)}
                className={cn(
                  "flex w-full items-start justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-muted",
                  focusRing,
                )}
              >
                {content}
              </button>
            </li>
          );
        }

        return (
          <li key={i} className="flex items-start justify-between gap-3 px-5 py-3">
            {content}
          </li>
        );
      })}
    </ul>
    {hidden > 0 ? (
      <p className="border-t border-border px-5 py-3 text-xs text-soft">
        + {nf.format(hidden)} não exibido(s) — mostrando os primeiros{" "}
        {nf.format(items.length)} de {nf.format(total)}.
      </p>
    ) : null}
    </>
  );
}

export function GovernancaView({
  governance,
  onOpenConsultant,
}: GovernancaViewProps) {
  // Totais REAIS (não o tamanho das listas truncadas) — senão os cartões
  // travariam em 50 e divergiriam da Visão Executiva.
  const pendingCount = governance.pendingSkillsTotal;
  const expiringCount = governance.expiringCertsTotal;
  const missingCount = governance.missingDataTotal;

  return (
    <div className="space-y-6">
      {/* Banner de contexto */}
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface-muted px-4 py-3">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-soft" />
        <p className="text-xs leading-5 text-medium">
          Esta aba registra o que precisa de atenção na base: validações de
          skill pendentes, certificados vencidos ou vencendo em breve e lacunas
          de cadastro. A ausência de certificação não é um problema — o cadastro
          não é obrigatório.
        </p>
      </div>

      {/* KPIs de governança */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard
          index={0}
          icon={Clock}
          label="Skills pendentes de validação"
          value={nf.format(pendingCount)}
          valueClassName={pendingCount > 0 ? "text-warning" : undefined}
        />
        <MetricCard
          index={1}
          icon={CalendarClock}
          label="Certificados vencidos ou vencendo"
          value={nf.format(expiringCount)}
          valueClassName={expiringCount > 0 ? "text-danger" : undefined}
        />
        <MetricCard
          index={2}
          icon={FileWarning}
          label="Lacunas de cadastro"
          value={nf.format(missingCount)}
          valueClassName={missingCount > 0 ? "text-warning" : undefined}
        />
      </div>

      {/* Listas de pendências */}
      <div className="space-y-4">
        <SectionPanel
          title="Skills pendentes de validação"
          description="Vínculos aguardando confirmação de um validador."
        >
          <GovList
            items={governance.pendingSkills}
            total={governance.pendingSkillsTotal}
            emptyLabel="Nada pendente aqui."
            onOpenConsultant={onOpenConsultant}
          />
        </SectionPanel>

        <SectionPanel
          title="Certificados vencidos ou vencendo"
          description="Credenciais vencidas ou com vencimento em até 90 dias."
        >
          <GovList
            items={governance.expiringCerts}
            total={governance.expiringCertsTotal}
            emptyLabel="Nada pendente aqui."
            onOpenConsultant={onOpenConsultant}
          />
        </SectionPanel>

        <SectionPanel
          title="Lacunas de cadastro"
          description="Consultores sem skill, sem contratação ou certificado sem emissor/data."
        >
          <GovList
            items={governance.missingData}
            total={governance.missingDataTotal}
            emptyLabel="Nada pendente aqui."
            onOpenConsultant={onOpenConsultant}
          />
        </SectionPanel>
      </div>
    </div>
  );
}
