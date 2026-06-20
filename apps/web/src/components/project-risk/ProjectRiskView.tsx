"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ListFilter, ShieldAlert, Sparkles } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  riskLevelLabels,
  type RiskLevel,
  type RiskResult,
} from "@/lib/project-risk/types";
import type { ProjectRiskResultBundle } from "@/lib/db/project-risk";
import { RiskProjectCard } from "./RiskProjectCard";

export interface ProjectRiskViewProps {
  bundle: ProjectRiskResultBundle;
  selectedProjectId: string | null;
  financialIncluded: boolean;
  aiEnabled: boolean;
  aiProviderReady: boolean;
}

const levelTone = {
  GREEN: "success",
  YELLOW: "warning",
  RED: "danger",
} as const;

/**
 * Orquestrador da IA de Risco de Projeto (§8.3). Lista de projetos com semáforo
 * (verde/amarelo/vermelho) e, ao selecionar um, o detalhe com o breakdown dos
 * sinais, recomendações e (atrás de flag) o sinal de sentimento por IA. Tudo
 * determinístico no núcleo; a IA é sugestão e não muda status. Sem chart externo,
 * sem animação.
 */
export function ProjectRiskView({
  bundle,
  selectedProjectId,
  financialIncluded,
  aiEnabled,
  aiProviderReady,
}: ProjectRiskViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function select(projectId: string | null) {
    startTransition(() => {
      router.replace(
        projectId
          ? `/app/risco-projetos?projectId=${encodeURIComponent(projectId)}`
          : "/app/risco-projetos",
      );
    });
  }

  const counts = countByLevel(bundle.results);

  if (bundle.results.length === 0) {
    return (
      <div className="space-y-6">
        <GovernanceNote financialIncluded={financialIncluded} />
        <EmptyState
          icon={ShieldAlert}
          title="Nenhum projeto no seu escopo"
          description="Não há projetos ativos visíveis para o seu perfil. Gestores de projeto veem apenas os projetos que gerenciam."
        />
      </div>
    );
  }

  const selected = selectedProjectId
    ? bundle.results.find((r) => r.projectId === selectedProjectId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <GovernanceNote financialIncluded={financialIncluded} />

      {/* Resumo do semáforo */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-soft">
        {bundle.fromMock ? (
          <StatusBadge tone="warning">Dados de exemplo (sem banco)</StatusBadge>
        ) : null}
        {(["RED", "YELLOW", "GREEN"] as RiskLevel[]).map((lvl) => (
          <StatusBadge key={lvl} tone={levelTone[lvl]}>
            {riskLevelLabels[lvl]}: {counts[lvl]}
          </StatusBadge>
        ))}
        {!financialIncluded ? (
          <span>Sinal de margem não incluído (perfil sem acesso financeiro).</span>
        ) : null}
      </div>

      {selected ? (
        <div className="space-y-4">
          <ActionButton
            variant="secondary"
            size="sm"
            icon={ListFilter}
            onClick={() => select(null)}
            disabled={isPending}
          >
            Voltar à lista
          </ActionButton>
          <RiskProjectCard
            result={selected}
            expanded
            aiEnabled={aiEnabled}
            aiProviderReady={aiProviderReady}
          />
        </div>
      ) : (
        <ul className="space-y-4">
          {bundle.results.map((result) => (
            <li key={result.projectId}>
              <button
                type="button"
                onClick={() => select(result.projectId)}
                disabled={isPending}
                className="block w-full text-left"
                aria-label={`Ver detalhe de risco de ${result.projectName}`}
              >
                <RiskProjectCard
                  result={result}
                  expanded={false}
                  aiEnabled={aiEnabled}
                  aiProviderReady={aiProviderReady}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      {aiEnabled && !aiProviderReady ? (
        <p className="text-xs text-soft">
          <Sparkles aria-hidden="true" className="mr-1 inline size-3.5" />
          Análise de sentimento por IA habilitada por flag, mas o provedor não está
          configurado — o sinal aparece como indisponível e o nível de risco
          determinístico permanece intacto.
        </p>
      ) : null}
    </div>
  );
}

function countByLevel(results: RiskResult[]): Record<RiskLevel, number> {
  const counts: Record<RiskLevel, number> = { GREEN: 0, YELLOW: 0, RED: 0 };
  for (const r of results) counts[r.level] += 1;
  return counts;
}

function GovernanceNote({ financialIncluded }: { financialIncluded: boolean }) {
  return (
    <p className="rounded-md border-2 border-ink bg-marker/60 px-3 py-2 text-xs font-medium text-ink">
      O nível de risco é <strong>determinístico e transparente</strong> (burn
      rate, prazo{financialIncluded ? ", margem" : ""} e feedbacks de
      preocupação), com o peso de cada sinal visível. A IA é uma{" "}
      <strong>sugestão</strong>: o sentimento por IA, quando disponível, é um sinal
      à parte e <strong>não muda</strong> o nível nem o status do projeto.
    </p>
  );
}
