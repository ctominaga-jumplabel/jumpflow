import type { Metadata } from "next";
import { requireRoleOrPermission } from "@/lib/auth/guards";
import { canEach } from "@/lib/auth/permissions";
import { SCREEN_CODES, SUBSCREEN_CODES } from "@/lib/auth/permission-codes";
import { isDatabaseConfigured } from "@/lib/db/config";
import { TalentDashboardView } from "@/components/talent-dashboard/TalentDashboardView";
import {
  TALENT_TABS,
  type TalentDashboardData,
  type TalentTabId,
} from "@/components/talent-dashboard/types";

export const metadata: Metadata = { title: "Painel de Talentos" };

/** Papéis de gestão/Pessoas com acesso ao painel; a matriz (PAINEL_TALENTOS) pode ampliar. */
const TALENT_ROLES = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
] as const;

/**
 * Subtela da matriz que governa cada aba. A "Visão Executiva" (primeira aba)
 * não tem subtela: é regida pelo código da própria tela.
 */
const TAB_SUBSCREEN = {
  talent: SUBSCREEN_CODES.talentDashboard.talentFinder,
  skills: SUBSCREEN_CODES.talentDashboard.skills,
  certificacoes: SUBSCREEN_CODES.talentDashboard.certifications,
  consultores: SUBSCREEN_CODES.talentDashboard.consultants,
  matriz: SUBSCREEN_CODES.talentDashboard.skillsMatrix,
  inativos: SUBSCREEN_CODES.talentDashboard.inactive,
  governanca: SUBSCREEN_CODES.talentDashboard.governance,
} as const satisfies Partial<Record<TalentTabId, string>>;

/** Abas liberadas pela matriz, na ordem de exibição (a primeira sempre entra). */
async function resolveAllowedTabs(): Promise<TalentTabId[]> {
  const granted = await canEach(Object.values(TAB_SUBSCREEN));
  return TALENT_TABS.map((tab) => tab.id).filter((id) =>
    id === "visao" ? true : granted[TAB_SUBSCREEN[id]],
  );
}

/**
 * Remove do payload as fatias que nenhuma aba liberada usa, para que dados de
 * abas negadas não cheguem ao cliente. O `summary` é da Visão Executiva (sempre
 * visível); `consultants` também alimenta o modal de perfil aberto pelas abas.
 */
function pruneForTabs(
  data: TalentDashboardData,
  allowed: readonly TalentTabId[],
): TalentDashboardData {
  const has = (id: TalentTabId) => allowed.includes(id);
  const needsConsultants = allowed.some((id) => id !== "visao");
  return {
    ...data,
    consultants: needsConsultants ? data.consultants : [],
    skillCatalog: has("skills") || has("matriz") ? data.skillCatalog : [],
    certCatalog: has("certificacoes") ? data.certCatalog : [],
    governance: has("governanca")
      ? data.governance
      : {
          pendingSkills: [],
          expiringCerts: [],
          missingData: [],
          pendingSkillsTotal: 0,
          expiringCertsTotal: 0,
          missingDataTotal: 0,
        },
  };
}

/** Payload vazio para o estado de demonstração (sem banco configurado). */
function emptyDashboardData(): TalentDashboardData {
  return {
    summary: {
      totalConsultants: 0,
      active: 0,
      inactive: 0,
      onLeave: 0,
      skillLinks: 0,
      validatedSkillLinks: 0,
      consultantsWithSkill: 0,
      certs: 0,
      certsValid: 0,
      certsExpired: 0,
      consultantsWithCert: 0,
      coursesCompleted: 0,
      distinctSkills: 0,
      distinctIssuers: 0,
      byContract: [],
      bySeniority: [],
      byArea: [],
      bySkillCategory: [],
      byIssuer: [],
      bySkillLevel: [],
    },
    consultants: [],
    skillCatalog: [],
    certCatalog: [],
    governance: {
      pendingSkills: [],
      expiringCerts: [],
      missingData: [],
      pendingSkillsTotal: 0,
      expiringCertsTotal: 0,
      missingDataTotal: 0,
    },
    generatedAt: new Date().toISOString(),
    databaseReady: false,
  };
}

export default async function PainelTalentosPage() {
  // Audiência de gestão/Pessoas por papel OU pela matriz configurável
  // (PAINEL_TALENTOS, código próprio da tela). O escopo/PII é reforçado no
  // servidor pela camada de leitura, que nunca expõe dados financeiros.
  await requireRoleOrPermission(
    [...TALENT_ROLES],
    SCREEN_CODES.talentDashboard,
    "view",
  );

  // Cada aba além da Visão Executiva também exige a sua subtela na matriz.
  const allowedTabs = await resolveAllowedTabs();

  const databaseReady = isDatabaseConfigured();

  let data: TalentDashboardData;
  if (databaseReady) {
    // Import dinâmico: só toca o Prisma quando há banco (config.ts é a porta).
    const { getTalentDashboardData } = await import(
      "@/lib/db/talent-dashboard"
    );
    // Uma única query alimenta o summary da Visão Executiva; as fatias das
    // abas negadas são descartadas antes de serializar para o cliente.
    data = pruneForTabs(await getTalentDashboardData(), allowedTabs);
  } else {
    data = emptyDashboardData();
  }

  return <TalentDashboardView data={data} allowedTabs={allowedTabs} />;
}
