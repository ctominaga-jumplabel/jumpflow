import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsultantScoreView } from "@/components/consultant-score/ConsultantScoreView";
import { requireRole } from "@/lib/auth/guards";
import { getConsultantScores } from "@/lib/db/consultant-score";
import { CONSULTANT_SCORE_READ_ROLES } from "@/lib/consultant-score/visibility";
import { consultantScoreQuerySchema } from "@/lib/consultant-score/schemas";
import { isAiScoreNarrativeEnabled } from "@/lib/ai/flags";
import { isAiProviderConfigured } from "@/lib/ai/provider";

export const metadata: Metadata = { title: "Score do Consultor" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ConsultantScorePage({ searchParams }: PageProps) {
  const user = await requireRole(CONSULTANT_SCORE_READ_ROLES);
  const params = await searchParams;

  // Validação no servidor da query (Zod). Parse defensivo: consultantId inválido
  // simplesmente cai para a lista (não dispara erro de tela).
  const parsed = consultantScoreQuerySchema.safeParse({
    consultantId: firstParam(params.consultantId) ?? null,
  });
  const query = parsed.success ? parsed.data : { consultantId: null };

  // RBAC, escopo por linha e o gate financeiro são resolvidos DENTRO do read.
  const bundle = await getConsultantScores(user, query);

  // A flag só governa o enriquecimento LLM (narrativa). Mesmo ligada, sem
  // provider real a narrativa fica indisponível (provider noop) — a UI sinaliza.
  const aiEnabled = isAiScoreNarrativeEnabled();
  const aiProviderReady = isAiProviderConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos · Inteligência"
        title="Score do Consultor"
        description="Score 0–100 determinístico e transparente por consultor — por avaliações, consistência de apontamento, certificações, capacitação, saldo de feedback e realização financeira. A composição é sempre visível; a IA não toma decisão de pessoas."
      />
      <ConsultantScoreView
        bundle={bundle}
        selectedConsultantId={bundle.selectedConsultantId}
        financialIncluded={bundle.financialIncluded}
        aiEnabled={aiEnabled}
        aiProviderReady={aiProviderReady}
      />
    </div>
  );
}
