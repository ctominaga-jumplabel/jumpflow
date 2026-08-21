import type { Metadata } from "next";
import { requireRoleOrPermission } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { TalentDashboardView } from "@/components/talent-dashboard/TalentDashboardView";
import type { TalentDashboardData } from "@/components/talent-dashboard/types";

export const metadata: Metadata = { title: "Painel de Talentos" };

/** Papéis de gestão/Pessoas com acesso ao painel; a matriz (CONSULTORES) pode ampliar. */
const TALENT_ROLES = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
] as const;

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
  // (CONSULTORES — código ATIVO e semeado; COMPETENCIAS está desabilitado em
  // disabled-modules.ts e esconderia a aba). O escopo/PII é reforçado no
  // servidor pela camada de leitura, que nunca expõe dados financeiros.
  await requireRoleOrPermission([...TALENT_ROLES], "CONSULTORES", "view");

  const databaseReady = isDatabaseConfigured();

  let data: TalentDashboardData;
  if (databaseReady) {
    // Import dinâmico: só toca o Prisma quando há banco (config.ts é a porta).
    const { getTalentDashboardData } = await import(
      "@/lib/db/talent-dashboard"
    );
    data = await getTalentDashboardData();
  } else {
    data = emptyDashboardData();
  }

  return <TalentDashboardView data={data} />;
}
