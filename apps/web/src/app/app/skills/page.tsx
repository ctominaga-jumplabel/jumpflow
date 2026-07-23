import type { ComponentProps } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkillMatrix } from "@/components/skills/SkillMatrix";
import { SkillCoveragePanel } from "@/components/skills/SkillCoveragePanel";
import { SkillSuggestionPanel } from "@/components/skills/SkillSuggestionPanel";
import { SkillsTabs } from "@/components/skills/SkillsTabs";
import { SkillCatalogManager } from "@/components/competencies/SkillCatalogManager";
import { requireUser, hasRole } from "@/lib/auth/guards";
import { COMPETENCY_WRITE_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isCurriculumAiImportEnabled } from "@/lib/skills/flags";
import { parseWeekParam, toIsoDate } from "@/lib/timesheet/week";
import { skills as mockSkills, type Skill } from "@/lib/mock-data/skills";
import type { SkillCatalogItem } from "@/lib/competencies/types";

export const metadata: Metadata = { title: "Skills" };

interface SkillsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SkillsPage({ searchParams }: SkillsPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const weekStart = parseWeekParam(params.semana);
  const databaseReady = isDatabaseConfigured();
  let suggestions: ComponentProps<typeof SkillSuggestionPanel>["suggestions"] =
    [];
  // US12.03: a matriz lê o catálogo persistido (com distribuição de níveis
  // derivada de ConsultantSkill). Sem DB, usa o mock — apenas em dev/offline,
  // nunca como fallback silencioso em produção (o page só atinge isto sem DB).
  let catalogSkills: Skill[] = mockSkills;
  // Gerenciamento de catálogo (reusa as actions de /app/competencias). Só é
  // exposto a quem pode escrever (ADMIN/PEOPLE); a escrita é gated no servidor.
  const canManageCatalog = hasRole(user, COMPETENCY_WRITE_ROLES);
  let catalogItems: SkillCatalogItem[] = [];
  const aiImportEnabled = isCurriculumAiImportEnabled();

  if (databaseReady) {
    const { getConsultantForUser } = await import("@/lib/db/timesheet");
    const { listSkillCoverage, listSkillCatalog } = await import(
      "@/lib/db/competencies"
    );
    const { prisma } = await import("@jumpflow/database");
    catalogSkills = await listSkillCoverage();
    if (canManageCatalog) {
      catalogItems = await listSkillCatalog();
    }
    const consultant = await getConsultantForUser(user);
    if (consultant) {
      const rows = await prisma.skillSuggestion.findMany({
        where: {
          consultantId: consultant.id,
          weekStart,
          status: "PENDING",
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          skillId: true,
          suggestedName: true,
          suggestedCategory: true,
          suggestedLevel: true,
          evidenceSummary: true,
          status: true,
        },
      });
      suggestions = rows.map((row) => ({
        id: row.id,
        skillId: row.skillId,
        suggestedName: row.suggestedName,
        suggestedCategory: row.suggestedCategory,
        suggestedLevel: row.suggestedLevel,
        evidenceSummary: row.evidenceSummary,
        status: row.status,
      }));
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Skills"
        description="Matriz de competencias por categoria, niveis e gaps de cobertura do time."
      />
      <SkillsTabs
        aiImportEnabled={aiImportEnabled}
        catalogContent={
          databaseReady && canManageCatalog ? (
            <SkillCatalogManager catalog={catalogItems} canManage />
          ) : undefined
        }
        skillsContent={
          <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
            <SkillMatrix skills={catalogSkills} />
            <div className="space-y-6">
              <SkillSuggestionPanel
                weekStart={toIsoDate(weekStart)}
                suggestions={suggestions}
                databaseReady={databaseReady}
              />
              <SkillCoveragePanel skills={catalogSkills} />
            </div>
          </div>
        }
      />
    </div>
  );
}
