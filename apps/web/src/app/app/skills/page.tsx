import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SkillMatrix } from "@/components/skills/SkillMatrix";
import { SkillCoveragePanel } from "@/components/skills/SkillCoveragePanel";
import { skills } from "@/lib/mock-data/skills";

export const metadata: Metadata = { title: "Skills" };

export default function SkillsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Skills"
        description="Matriz de competências por categoria, níveis e gaps de cobertura do time."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <SkillMatrix skills={skills} />
        <SkillCoveragePanel skills={skills} />
      </div>
    </div>
  );
}
