import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { CoeView } from "@/components/coe/CoeView";
import { requireRole } from "@/lib/auth/guards";
import { SUBSCREEN_CODES } from "@/lib/auth/permission-codes";
import { canEach } from "@/lib/auth/permissions";
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
  title: "Painel COE — Centro Operacional de Excelência",
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
 * Visão geral dos consultores de REFERÊNCIA da Jump (para projetos e para
 * dúvidas internas), curadoria do núcleo e composição de times para
 * PARALELIZAR frentes de um projeto. A composição é um read-model derivado (skills validadas
 * + disponibilidade + histórico), calculada sob demanda pela engine pura; o que
 * persiste é apenas o núcleo e a proposta salva.
 *
 * O guard de papel é a fronteira de leitura; as escritas têm guards próprios nas
 * server actions (curadoria e proposta são fronteiras diferentes). O fator
 * financeiro do ranking é resolvido no servidor e nunca chega ao cliente para
 * quem não pode vê-lo.
 *
 * Subtelas: "Visão geral" segue o código da própria tela; composição, propostas
 * e curadoria exigem `view` na matriz no código de cada uma. Aba negada não
 * aparece e os dados dela nem são carregados.
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

  const subscreens = await canEach([
    SUBSCREEN_CODES.coe.composition,
    SUBSCREEN_CODES.coe.proposals,
    SUBSCREEN_CODES.coe.curation,
  ]);
  const allowedTabs = {
    composition: subscreens[SUBSCREEN_CODES.coe.composition],
    proposals: subscreens[SUBSCREEN_CODES.coe.proposals],
    curation: subscreens[SUBSCREEN_CODES.coe.curation],
  };

  // Membros alimentam a visão geral (aba padrão) e a curadoria; o resto só é
  // lido quando a aba correspondente está liberada.
  const [members, candidateOptions, projects, skillOptions, squads, bundle] =
    await Promise.all([
      listCoeMembers(),
      allowedTabs.curation ? listCoeCandidateOptions() : Promise.resolve([]),
      allowedTabs.composition ? listCoeProjectOptions() : Promise.resolve([]),
      allowedTabs.composition ? listCoeSkillOptions() : Promise.resolve([]),
      allowedTabs.proposals ? listCoeSquads() : Promise.resolve([]),
      allowedTabs.composition
        ? getCoeComposition(user, query)
        : Promise.resolve(null),
    ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos · Inteligência"
        title="Painel COE — Centro Operacional de Excelência"
        description="Os consultores de referência da Jump por área de excelência — para indicar em projetos e para recorrer em dúvidas internas. Abra um perfil para o detalhe ou monte um time na composição; a alocação continua sendo decisão humana."
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
        allowedTabs={allowedTabs}
      />
    </div>
  );
}
