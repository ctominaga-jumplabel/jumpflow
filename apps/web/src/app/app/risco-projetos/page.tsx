import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProjectRiskView } from "@/components/project-risk/ProjectRiskView";
import { requireRole } from "@/lib/auth/guards";
import { getProjectRisks } from "@/lib/db/project-risk";
import {
  PROJECT_RISK_READ_ROLES,
  includeFinancialSignal,
} from "@/lib/project-risk/visibility";
import { projectRiskQuerySchema } from "@/lib/project-risk/schemas";
import { isAiRiskSentimentEnabled } from "@/lib/ai/flags";
import { isAiProviderConfigured } from "@/lib/ai/provider";

export const metadata: Metadata = { title: "IA de Risco de Projeto" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProjectRiskPage({ searchParams }: PageProps) {
  const user = await requireRole(PROJECT_RISK_READ_ROLES);
  const params = await searchParams;

  // Validação no servidor da query (Zod). Parse defensivo: projectId inválido
  // simplesmente cai para a lista (não dispara erro de tela).
  const parsed = projectRiskQuerySchema.safeParse({
    projectId: firstParam(params.projectId) ?? null,
  });
  const query = parsed.success ? parsed.data : { projectId: null };

  const bundle = await getProjectRisks(user, query);

  // A flag só governa o enriquecimento LLM (sentimento). Mesmo ligada, sem
  // provider real o sinal fica indisponível (provider noop) — a UI sinaliza.
  const aiEnabled = isAiRiskSentimentEnabled();
  const aiProviderReady = isAiProviderConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos · Inteligência"
        title="IA de Risco de Projeto"
        description="Semáforo determinístico e transparente do risco de cada projeto — por burn rate, prazo, margem e feedbacks de preocupação. A análise apoia a decisão; a IA não muda o status do projeto."
      />
      <ProjectRiskView
        bundle={bundle}
        selectedProjectId={bundle.selectedProjectId}
        financialIncluded={includeFinancialSignal(user.roles)}
        aiEnabled={aiEnabled}
        aiProviderReady={aiProviderReady}
      />
    </div>
  );
}
