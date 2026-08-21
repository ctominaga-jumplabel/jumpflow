"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { FilterChip } from "@/components/ui/FilterChip";
import {
  TALENT_TABS,
  type DashConsultant,
  type TalentDashboardData,
  type TalentTabId,
} from "@/components/talent-dashboard/types";
import { ConsultantProfileModal } from "@/components/talent-dashboard/ConsultantProfileModal";
import { VisaoExecutivaView } from "@/components/talent-dashboard/VisaoExecutivaView";
import { TalentFinderView } from "@/components/talent-dashboard/TalentFinderView";
import { SkillsView } from "@/components/talent-dashboard/SkillsView";
import { CertificacoesView } from "@/components/talent-dashboard/CertificacoesView";
import { ConsultoresView } from "@/components/talent-dashboard/ConsultoresView";
import { MatrizSkillsView } from "@/components/talent-dashboard/MatrizSkillsView";
import { BancoInativosView } from "@/components/talent-dashboard/BancoInativosView";
import { GovernancaView } from "@/components/talent-dashboard/GovernancaView";

export interface TalentDashboardViewProps {
  data: TalentDashboardData;
}

/**
 * Shell client do Painel de Talentos: cabeçalho, banner de demonstração quando
 * não há banco, abas client-side e o modal de perfil compartilhado. Distribui as
 * fatias tipadas do payload para a sub-view ativa.
 */
export function TalentDashboardView({ data }: TalentDashboardViewProps) {
  const [activeTab, setActiveTab] = useState<TalentTabId>(TALENT_TABS[0].id);
  const [selectedConsultantId, setSelectedConsultantId] = useState<
    string | null
  >(null);

  const selectedConsultant = useMemo<DashConsultant | null>(() => {
    if (!selectedConsultantId) return null;
    return (
      data.consultants.find((c) => c.id === selectedConsultantId) ?? null
    );
  }, [selectedConsultantId, data.consultants]);

  const onOpenConsultant = (id: string) => setSelectedConsultantId(id);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Painel de Talentos"
        description="Skills, certificações e busca de talentos da base — dados ao vivo."
      />

      {!data.databaseReady ? (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border-2 border-warning bg-warning-soft px-4 py-3 text-warning">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Modo demonstração</p>
            <p className="text-warning/90">
              Banco de dados não configurado. As abas abaixo aparecem vazias até
              a conexão ser estabelecida.
            </p>
          </div>
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Seções do painel de talentos"
        className="flex flex-wrap gap-2"
      >
        {TALENT_TABS.map((tab) => (
          <FilterChip
            key={tab.id}
            label={tab.label}
            active={tab.id === activeTab}
            onClick={() => setActiveTab(tab.id)}
          />
        ))}
      </div>

      <div>
        {activeTab === "visao" ? (
          <VisaoExecutivaView summary={data.summary} />
        ) : null}
        {activeTab === "talent" ? (
          <TalentFinderView
            consultants={data.consultants}
            onOpenConsultant={onOpenConsultant}
          />
        ) : null}
        {activeTab === "skills" ? (
          <SkillsView
            skillCatalog={data.skillCatalog}
            consultants={data.consultants}
            onOpenConsultant={onOpenConsultant}
          />
        ) : null}
        {activeTab === "certificacoes" ? (
          <CertificacoesView
            certCatalog={data.certCatalog}
            consultants={data.consultants}
            onOpenConsultant={onOpenConsultant}
          />
        ) : null}
        {activeTab === "consultores" ? (
          <ConsultoresView
            consultants={data.consultants}
            onOpenConsultant={onOpenConsultant}
          />
        ) : null}
        {activeTab === "matriz" ? (
          <MatrizSkillsView
            consultants={data.consultants}
            skillCatalog={data.skillCatalog}
            onOpenConsultant={onOpenConsultant}
          />
        ) : null}
        {activeTab === "inativos" ? (
          <BancoInativosView
            consultants={data.consultants}
            onOpenConsultant={onOpenConsultant}
          />
        ) : null}
        {activeTab === "governanca" ? (
          <GovernancaView
            governance={data.governance}
            summary={data.summary}
            onOpenConsultant={onOpenConsultant}
          />
        ) : null}
      </div>

      <ConsultantProfileModal
        consultant={selectedConsultant}
        onClose={() => setSelectedConsultantId(null)}
      />
    </div>
  );
}
