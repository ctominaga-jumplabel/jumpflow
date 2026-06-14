import type { ComponentProps } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkillMatrix } from "@/components/skills/SkillMatrix";
import { SkillCoveragePanel } from "@/components/skills/SkillCoveragePanel";
import { SkillSuggestionPanel } from "@/components/skills/SkillSuggestionPanel";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { parseWeekParam, toIsoDate } from "@/lib/timesheet/week";
import { skills } from "@/lib/mock-data/skills";

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

  if (databaseReady) {
    const { getConsultantForUser } = await import("@/lib/db/timesheet");
    const { prisma } = await import("@jumpflow/database");
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
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <SkillMatrix skills={skills} />
        <div className="space-y-6">
          <SkillSuggestionPanel
            weekStart={toIsoDate(weekStart)}
            suggestions={suggestions}
            databaseReady={databaseReady}
          />
          <SkillCoveragePanel skills={skills} />
        </div>
      </div>
    </div>
  );
}
