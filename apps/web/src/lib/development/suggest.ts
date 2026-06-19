import { skillLevelLabels } from "@/lib/competencies/types";
import type {
  DevelopmentActionType,
  GapSkillInput,
  SuggestedAction,
} from "./types";

/**
 * Pure domain logic for generating PDI action SUGGESTIONS from a consultant's
 * gap analysis (EP17 US17.01).
 *
 * No I/O: the DB read layer resolves the applicable profile and the gap (reusing
 * lib/competencies/gap.ts), then passes the gap skills here. The output is a
 * draft list the human reviews/edits before anything is persisted — nothing is
 * created automatically (same philosophy as SkillSuggestion). Reusable and
 * unit-tested directly.
 */

/**
 * Tipo de ação sugerido por tamanho da lacuna:
 * - Lacuna grande (>= 2 níveis) → CERTIFICATION (capacitação formal/estruturada).
 * - Lacuna menor (1 nível) → TRAINING (treinamento/curso pontual).
 * Comportamental nunca vira CERTIFICATION (não se certifica soft skill); cai
 * para MENTORSHIP, que é a alavanca natural de evolução comportamental.
 */
const LARGE_GAP_THRESHOLD = 2;

export function suggestedTypeForGap(gap: GapSkillInput): DevelopmentActionType {
  if (gap.skillType === "BEHAVIORAL") {
    return "MENTORSHIP";
  }
  return gap.gap >= LARGE_GAP_THRESHOLD ? "CERTIFICATION" : "TRAINING";
}

/** Descrição-base editável da ação sugerida (humano refina antes de salvar). */
export function suggestedDescription(gap: GapSkillInput): string {
  const target = skillLevelLabels[gap.requiredLevel];
  const current = gap.currentLevel
    ? skillLevelLabels[gap.currentLevel]
    : "não avaliado";
  return `Evoluir ${gap.skillName} de ${current} para ${target}.`;
}

/**
 * Gera as ações sugeridas a partir das skills com gap. Apenas lacunas positivas
 * (atual < requerido) viram sugestão; skills que atendem ou não avaliadas não
 * geram ação automática (o gestor as adiciona manualmente se quiser). Ordena por
 * maior lacuna primeiro, depois por nome (determinístico para testes/UI).
 *
 * A saída é um RASCUNHO: cada item carrega targetSkillId, tipo e descrição-base,
 * todos editáveis na UI antes da confirmação (US17.01).
 */
export function suggestActionsFromGap(
  gapSkills: ReadonlyArray<GapSkillInput>,
): SuggestedAction[] {
  return gapSkills
    .filter((g) => g.gap > 0)
    .slice()
    .sort(
      (a, b) =>
        b.gap - a.gap || a.skillName.localeCompare(b.skillName, "pt-BR"),
    )
    .map((g) => ({
      type: suggestedTypeForGap(g),
      targetSkillId: g.skillId,
      targetSkillName: g.skillName,
      description: suggestedDescription(g),
    }));
}
