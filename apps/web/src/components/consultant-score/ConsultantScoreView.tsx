"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ListFilter, Sparkles, Trophy } from "lucide-react";
import { ActionButton } from "@/components/ui/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  scoreBandLabels,
  type ScoreBand,
  type ScoreResult,
} from "@/lib/consultant-score/types";
import type { ConsultantScoreResultBundle } from "@/lib/db/consultant-score";
import { ScoreConsultantCard } from "./ScoreConsultantCard";

export interface ConsultantScoreViewProps {
  bundle: ConsultantScoreResultBundle;
  selectedConsultantId: string | null;
  financialIncluded: boolean;
  aiEnabled: boolean;
  aiProviderReady: boolean;
}

const bandTone = {
  HIGH: "success",
  MEDIUM: "info",
  LOW: "danger",
} as const;

/**
 * Orquestrador do Score do Consultor (§8.4). Lista de consultores com score +
 * mini-breakdown e, ao selecionar um, o detalhe com a composição por fator, a
 * tendência e (atrás de flag) a narrativa por IA. Tudo determinístico no núcleo;
 * a IA é sugestão e não decide sobre pessoas. Sem chart externo, sem animação.
 */
export function ConsultantScoreView({
  bundle,
  selectedConsultantId,
  financialIncluded,
  aiEnabled,
  aiProviderReady,
}: ConsultantScoreViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function select(consultantId: string | null) {
    startTransition(() => {
      router.replace(
        consultantId
          ? `/app/score?consultantId=${encodeURIComponent(consultantId)}`
          : "/app/score",
      );
    });
  }

  if (bundle.results.length === 0) {
    return (
      <div className="space-y-6">
        <GovernanceNote financialIncluded={financialIncluded} />
        <EmptyState
          icon={Trophy}
          title="Nenhum consultor no seu escopo"
          description="Não há consultores com score visível para o seu perfil. Gestores de área veem apenas o time que gerenciam; o consultor vê apenas o próprio score."
        />
      </div>
    );
  }

  const counts = countByBand(bundle.results);

  const selected = selectedConsultantId
    ? bundle.results.find((r) => r.consultantId === selectedConsultantId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <GovernanceNote financialIncluded={financialIncluded} />

      {/* Resumo das faixas */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-soft">
        {bundle.fromMock ? (
          <StatusBadge tone="warning">Dados de exemplo (sem banco)</StatusBadge>
        ) : null}
        {(["HIGH", "MEDIUM", "LOW"] as ScoreBand[]).map((band) => (
          <StatusBadge key={band} tone={bandTone[band]}>
            {scoreBandLabels[band]}: {counts[band]}
          </StatusBadge>
        ))}
        {!financialIncluded ? (
          <span>Fator de realização financeira não incluído (perfil sem acesso financeiro).</span>
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
          <ScoreConsultantCard
            result={selected}
            expanded
            aiEnabled={aiEnabled}
            aiProviderReady={aiProviderReady}
          />
        </div>
      ) : (
        <ul className="space-y-4">
          {bundle.results.map((result) => (
            <li key={result.consultantId}>
              <button
                type="button"
                onClick={() => select(result.consultantId)}
                disabled={isPending}
                className="block w-full text-left"
                aria-label={`Ver detalhe do score de ${result.consultantName}`}
              >
                <ScoreConsultantCard
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
          Narrativa por IA habilitada por flag, mas o provedor não está
          configurado — o texto aparece como indisponível e o score determinístico
          permanece intacto.
        </p>
      ) : null}
    </div>
  );
}

function countByBand(results: ScoreResult[]): Record<ScoreBand, number> {
  const counts: Record<ScoreBand, number> = { HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const r of results) counts[r.band] += 1;
  return counts;
}

function GovernanceNote({ financialIncluded }: { financialIncluded: boolean }) {
  return (
    <p className="rounded-md border-2 border-ink bg-marker/60 px-3 py-2 text-xs font-medium text-ink">
      O score é <strong>determinístico e transparente</strong> (avaliações,
      consistência de apontamento, certificações, capacitação, saldo de feedback
      {financialIncluded ? " e realização financeira" : ""}), com o peso de cada
      fator visível. O saldo de feedback usa apenas <strong>contagens</strong>,
      sem expor conteúdo. A IA é uma <strong>sugestão</strong>: a narrativa, quando
      disponível, <strong>não muda</strong> o score nem toma decisão sobre pessoas.
    </p>
  );
}
