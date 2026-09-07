import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoeView } from "@/components/coe/CoeView";
import { requireRole } from "@/lib/auth/guards";
import {
  COE_READ_ROLES,
  canCurateCoe,
  canWriteCoeSquad,
} from "@/lib/coe/visibility";
import { coeCompositionQuerySchema } from "@/lib/coe/schemas";
import {
  getCoeComposition,
  listCoeCandidateOptions,
  listCoeMembers,
  listCoeProjectOptions,
  listCoeSkillOptions,
  listCoeSquads,
} from "@/lib/db/coe";

export const metadata: Metadata = {
  title: "COE — Centro Operacional de Excelência",
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function numberParam(
  value: string | string[] | undefined,
  fallback: number,
): number {
  const raw = firstParam(value);
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * COE — Centro Operacional de Excelência.
 *
 * Curadoria de consultores estratégicos e composição de times para PARALELIZAR
 * frentes de um projeto. A composição é um read-model derivado (skills validadas
 * + disponibilidade + histórico), calculada sob demanda pela engine pura; o que
 * persiste é apenas o núcleo e a proposta salva.
 *
 * O guard de papel é a fronteira de leitura; as escritas têm guards próprios nas
 * server actions (curadoria e proposta são fronteiras diferentes). O fator
 * financeiro do ranking é resolvido no servidor e nunca chega ao cliente para
 * quem não pode vê-lo.
 */
export default async function CoePage({ searchParams }: PageProps) {
  const user = await requireRole(COE_READ_ROLES);
  const params = await searchParams;

  const skillIds = (
    Array.isArray(params.skill)
      ? params.skill
      : params.skill
        ? [params.skill]
        : []
  ).filter((s): s is string => typeof s === "string");

  // Validação no servidor da query (Zod). Parse defensivo: um parâmetro inválido
  // cai para o default em vez de derrubar a tela.
  const parsed = coeCompositionQuerySchema.safeParse({
    projectId: firstParam(params.projectId) ?? null,
    scope: firstParam(params.scope) ?? "COE",
    skills: skillIds,
    periodStart: firstParam(params.periodStart) ?? null,
    weeks: numberParam(params.weeks, 4),
    manualSlots: numberParam(params.manualSlots, 3),
  });
  const query = parsed.success
    ? parsed.data
    : coeCompositionQuerySchema.parse({});

  const [members, candidateOptions, projects, skillOptions, squads, bundle] =
    await Promise.all([
      listCoeMembers(),
      listCoeCandidateOptions(),
      listCoeProjectOptions(),
      listCoeSkillOptions(),
      listCoeSquads(),
      getCoeComposition(user, query),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos · Inteligência"
        title="COE — Centro Operacional de Excelência"
        description="Núcleo de consultores estratégicos e composição de times para paralelizar frentes de um projeto. A sugestão distribui as pessoas pelas frentes sem repetir ninguém e mostra a cobertura de skills e a capacidade do conjunto — a alocação continua sendo decisão humana."
      />
      <CoeView
        members={members}
        candidateOptions={candidateOptions}
        projects={projects}
        skillOptions={skillOptions}
        squads={squads}
        bundle={bundle}
        query={query}
        canCurate={canCurateCoe(user.roles)}
        canPropose={canWriteCoeSquad(user.roles)}
      />
    </div>
  );
}
