import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AllocationFitView } from "@/components/allocation-ai/AllocationFitView";
import { requireRole } from "@/lib/auth/guards";
import {
  listAllocationProjectOptions,
  listAllocationSkillOptions,
  getAllocationFit,
  type AllocationFitResultBundle,
} from "@/lib/db/allocation-ai";
import {
  ALLOCATION_AI_READ_ROLES,
  includeFinancialFactor,
} from "@/lib/allocation-ai/visibility";
import { allocationFitQuerySchema } from "@/lib/allocation-ai/schemas";
import { isAiAllocationEnabled } from "@/lib/ai/flags";
import { isAiProviderConfigured } from "@/lib/ai/provider";

export const metadata: Metadata = { title: "IA de Alocação" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AllocationAiPage({ searchParams }: PageProps) {
  const user = await requireRole(ALLOCATION_AI_READ_ROLES);
  const params = await searchParams;

  const [projects, skillOptions] = await Promise.all([
    listAllocationProjectOptions(),
    listAllocationSkillOptions(),
  ]);

  // Validação no servidor da query (Zod). Parse defensivo dos search params: só
  // dispara o cálculo quando há um alvo válido (projeto ou skills).
  const projectId = firstParam(params.projectId) ?? null;
  const skillIds = (
    Array.isArray(params.skill) ? params.skill : params.skill ? [params.skill] : []
  ).filter((s): s is string => typeof s === "string");
  const periodStart = firstParam(params.periodStart) ?? null;
  const weeksRaw = firstParam(params.weeks);
  const weeks = weeksRaw ? Number(weeksRaw) : 4;

  const parsed = allocationFitQuerySchema.safeParse({
    projectId,
    skills: skillIds.map((id) => ({ skillId: id, requiredLevel: null })),
    periodStart,
    weeks: Number.isFinite(weeks) ? weeks : 4,
  });

  let bundle: AllocationFitResultBundle | null = null;
  if (parsed.success) {
    bundle = await getAllocationFit(user, parsed.data);
  }

  // A flag só governa o enriquecimento LLM. Mesmo ligada, sem provider real a
  // explicação fica indisponível (provider noop) — a UI sinaliza esse estado.
  const aiEnabled = isAiAllocationEnabled();
  const aiProviderReady = isAiProviderConfigured();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos · Inteligência"
        title="IA de Alocação"
        description="Ranking determinístico e transparente de consultores para uma alocação — por aderência de skills, disponibilidade e histórico com o cliente. A sugestão apoia a decisão; a alocação é sempre humana."
      />
      <AllocationFitView
        projects={projects}
        skillOptions={skillOptions}
        selectedProjectId={projectId}
        selectedSkillIds={skillIds}
        periodStart={periodStart}
        weeks={Number.isFinite(weeks) ? weeks : 4}
        bundle={bundle}
        queryError={parsed.success ? null : "Selecione um projeto ou ao menos uma skill."}
        financialIncluded={includeFinancialFactor(user.roles)}
        aiEnabled={aiEnabled}
        aiProviderReady={aiProviderReady}
      />
    </div>
  );
}
