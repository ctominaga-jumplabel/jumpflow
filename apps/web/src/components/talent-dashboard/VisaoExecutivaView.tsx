"use client";

import {
  Award,
  BadgeCheck,
  Building2,
  GraduationCap,
  Info,
  Layers,
  Lightbulb,
  Link2,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionPanel } from "@/components/ui/SectionPanel";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import type {
  BarDatum,
  TalentSummary,
} from "@/components/talent-dashboard/types";

export interface VisaoExecutivaViewProps {
  summary: TalentSummary;
}

const nf = new Intl.NumberFormat("pt-BR");

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** Barras horizontais por token: trilho neutro + preenchimento de marca. */
function BarList({ data }: { data: BarDatum[] }) {
  if (data.length === 0) {
    return (
      <p className="px-5 py-6 text-sm text-soft">Sem dados para exibir.</p>
    );
  }
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const max = data.reduce((m, d) => Math.max(m, d.value), 0);

  return (
    <ul className="space-y-3 px-5 py-4">
      {data.map((d) => {
        const width = max > 0 ? Math.max((d.value / max) * 100, 2) : 0;
        return (
          <li key={d.label}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm font-medium text-strong">
                {d.label}
              </span>
              <span className="shrink-0 text-xs tabular-nums text-soft">
                <span className="font-semibold text-medium">
                  {nf.format(d.value)}
                </span>{" "}
                · {pct(d.value, total)}%
              </span>
            </div>
            <div
              className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-surface-muted"
              role="presentation"
            >
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${width}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

interface Insight {
  kind: "Dado observado" | "Indicador" | "Ponto de atenção";
  tone: StatusTone;
  text: string;
}

/** Deriva 3 leituras diretas dos números — nunca inventa valores. */
function buildInsights(summary: TalentSummary): Insight[] {
  const insights: Insight[] = [];

  // 1) Dado observado — categoria/tecnologia mais presente.
  const topCategory = [...summary.bySkillCategory].sort(
    (a, b) => b.value - a.value,
  )[0];
  if (topCategory && topCategory.value > 0) {
    insights.push({
      kind: "Dado observado",
      tone: "neutral",
      text: `Categoria de skill mais presente: ${topCategory.label}, com ${nf.format(
        topCategory.value,
      )} ${topCategory.value === 1 ? "registro" : "registros"} na base.`,
    });
  } else {
    insights.push({
      kind: "Dado observado",
      tone: "neutral",
      text: "Ainda não há vínculos de skill categorizados para destacar.",
    });
  }

  // 2) Indicador — cobertura de certificação vigente.
  const validShare = pct(summary.certsValid, summary.certs);
  insights.push({
    kind: "Indicador",
    tone: "info",
    text:
      summary.certs > 0
        ? `${validShare}% das certificações registradas estão vigentes (${nf.format(
            summary.certsValid,
          )} de ${nf.format(summary.certs)}); ${nf.format(
            summary.consultantsWithCert,
          )} consultores possuem ao menos uma.`
        : "Nenhuma certificação registrada até o momento.",
  });

  // 3) Ponto de atenção — prioriza vencidas; depois validações pendentes.
  const pendingSkills = summary.skillLinks - summary.validatedSkillLinks;
  if (summary.certsExpired > 0) {
    insights.push({
      kind: "Ponto de atenção",
      tone: "warning",
      text: `${nf.format(summary.certsExpired)} ${
        summary.certsExpired === 1
          ? "certificação vencida precisa"
          : "certificações vencidas precisam"
      } de renovação ou baixa.`,
    });
  } else if (pendingSkills > 0) {
    insights.push({
      kind: "Ponto de atenção",
      tone: "warning",
      text: `${nf.format(pendingSkills)} ${
        pendingSkills === 1
          ? "vínculo de skill aguarda"
          : "vínculos de skill aguardam"
      } validação — ${pct(
        summary.validatedSkillLinks,
        summary.skillLinks,
      )}% já validados.`,
    });
  } else {
    insights.push({
      kind: "Ponto de atenção",
      tone: "info",
      text: "Sem certificações vencidas ou validações pendentes — base em dia.",
    });
  }

  return insights;
}

export function VisaoExecutivaView({ summary }: VisaoExecutivaViewProps) {
  if (summary.totalConsultants === 0) {
    return (
      <EmptyState
        icon={Users}
        title="Painel sem dados"
        description="Nenhum consultor disponível. O painel entra em modo demonstração até a base ser carregada ou a conexão com o banco ser estabelecida."
      />
    );
  }

  const insights = buildInsights(summary);

  return (
    <div className="space-y-6">
      {/* Banner de contexto */}
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface-muted px-4 py-3">
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-soft" />
        <p className="text-xs leading-5 text-medium">
          Cada indicador é derivado dos dados ao vivo da base. Certificações e
          cursos são contados separadamente, e cada skill carrega nível de
          proficiência e status de validação.
        </p>
      </div>

      {/* Banda de KPIs — linha 1 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          index={0}
          icon={Users}
          label="Consultores"
          value={nf.format(summary.totalConsultants)}
          hint={`${nf.format(summary.active)} ativos · ${nf.format(
            summary.inactive,
          )} inativos · ${nf.format(summary.onLeave)} afastados`}
        />
        <MetricCard
          index={1}
          icon={BadgeCheck}
          label="Certificações vigentes"
          value={nf.format(summary.certsValid)}
          valueClassName="text-success"
          hint={`${nf.format(summary.certsExpired)} vencidas`}
        />
        <MetricCard
          index={2}
          icon={ShieldCheck}
          label="Skills validadas"
          value={nf.format(summary.validatedSkillLinks)}
          hint={`de ${nf.format(summary.skillLinks)} vínculos`}
        />
        <MetricCard
          index={3}
          icon={GraduationCap}
          label="Cursos concluídos"
          value={nf.format(summary.coursesCompleted)}
        />
      </div>

      {/* Banda de KPIs — linha 2 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          index={4}
          icon={Link2}
          label="Vínculos de skill"
          value={nf.format(summary.skillLinks)}
          hint={`${nf.format(summary.consultantsWithSkill)} consultores com skill`}
        />
        <MetricCard
          index={5}
          icon={Layers}
          label="Skills distintas"
          value={nf.format(summary.distinctSkills)}
        />
        <MetricCard
          index={6}
          icon={Building2}
          label="Emissores distintos"
          value={nf.format(summary.distinctIssuers)}
        />
        <MetricCard
          index={7}
          icon={Award}
          label="Consultores com certificação"
          value={nf.format(summary.consultantsWithCert)}
        />
      </div>

      {/* Distribuições em barras */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionPanel
          title="Por contratação"
          description="Distribuição do vínculo operacional."
        >
          <BarList data={summary.byContract} />
        </SectionPanel>
        <SectionPanel
          title="Por senioridade"
          description="Distribuição por nível de carreira."
        >
          <BarList data={summary.bySeniority} />
        </SectionPanel>
        <SectionPanel
          title="Por área"
          description="Principais áreas da base."
        >
          <BarList data={summary.byArea} />
        </SectionPanel>
        <SectionPanel
          title="Por categoria de skill"
          description="Registros de skill por categoria."
        >
          <BarList data={summary.bySkillCategory} />
        </SectionPanel>
        <SectionPanel
          title="Por emissor de certificado"
          description="Principais instituições emissoras."
        >
          <BarList data={summary.byIssuer} />
        </SectionPanel>
        <SectionPanel
          title="Por nível de skill"
          description="Distribuição de proficiência (básico → especialista)."
        >
          <BarList data={summary.bySkillLevel} />
        </SectionPanel>
      </div>

      {/* Insights derivados */}
      <SectionPanel
        title="Insights"
        description="Leituras diretas dos números acima."
      >
        <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-3">
          {insights.map((insight, i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-canvas p-4"
            >
              <StatusBadge tone={insight.tone}>
                <Lightbulb aria-hidden="true" className="size-3" />
                {insight.kind}
              </StatusBadge>
              <p className="text-sm leading-6 text-medium">{insight.text}</p>
            </div>
          ))}
        </div>
      </SectionPanel>

      <p className="flex items-center gap-1.5 text-xs text-soft">
        <TriangleAlert aria-hidden="true" className="size-3.5" />
        Indicadores calculados sobre a base atual; ausência de certificação não
        é tratada como problema.
      </p>
    </div>
  );
}
