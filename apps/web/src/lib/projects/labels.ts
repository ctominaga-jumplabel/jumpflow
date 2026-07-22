import type { ProjectOpportunityType } from "@/lib/projects/types";

/**
 * pt-BR display labels for `ProjectOpportunityType`. Kept in `lib/projects` (not
 * in a client component) so both server surfaces (Financeiro, loaders) and
 * client components (ProjectsView) can share the exact same wording. The order
 * mirrors the `ProjectOpportunityType` enum in the Prisma schema.
 */
export const opportunityTypeLabels: Record<ProjectOpportunityType, string> = {
  PROJECT: "Projeto",
  ALLOCATION: "Alocação",
  SQUAD: "Squad",
  LICENSING: "Licenciamento",
  BPO: "BPO",
  SUPPORT: "Sustentação",
  OTHER: "Outro",
};

/** Ordered list of opportunity types for selects/filters. */
export const opportunityTypeOptions = Object.keys(
  opportunityTypeLabels,
) as ProjectOpportunityType[];

/** Display label tolerating null/unknown (manual projects have none). */
export function opportunityTypeLabel(
  value?: ProjectOpportunityType | null,
): string {
  return value ? opportunityTypeLabels[value] : "Não classificado";
}
