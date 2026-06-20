import type { SkillLevel } from "@/lib/competencies/types";
import { requiredLevelWeight, scoreToLevelWeight } from "./scale";
import type {
  EvaluationGapRow,
  EvaluationRelationship,
  HistoryPoint,
  HistorySeries,
  RadarAxis,
} from "./types";

/**
 * Pure aggregation for the evaluation result (US16.04 / US16.05): radar (média
 * por competência consolidando todos os avaliadores), gap (média convertida ×
 * nível requerido) e série histórica. No I/O — o read layer passa linhas planas.
 *
 * LGPD (DP-05): a entrada agrega notas de TODOS os relacionamentos numa média
 * por skill. A resposta individual de um par nunca chega a estas funções de
 * forma identificável; só somamos/contamos. O anonimato é estrutural.
 */

/** Uma nota submetida (já filtrada para respostas submetidas no read layer). */
export interface AnswerInput {
  skillId: string;
  skillName: string;
  skillType: "TECHNICAL" | "BEHAVIORAL";
  score: number;
  relationship: EvaluationRelationship;
}

/**
 * Radar: média de score (1–5) por competência, consolidando todas as respostas.
 * Ordenado por nome para uma leitura estável. Skills sem nota não aparecem.
 */
export function buildRadar(answers: ReadonlyArray<AnswerInput>): RadarAxis[] {
  const bySkill = new Map<
    string,
    {
      skillName: string;
      skillType: "TECHNICAL" | "BEHAVIORAL";
      sum: number;
      count: number;
    }
  >();
  for (const a of answers) {
    const acc = bySkill.get(a.skillId) ?? {
      skillName: a.skillName,
      skillType: a.skillType,
      sum: 0,
      count: 0,
    };
    acc.sum += a.score;
    acc.count += 1;
    bySkill.set(a.skillId, acc);
  }
  return [...bySkill.entries()]
    .map(([skillId, acc]) => ({
      skillId,
      skillName: acc.skillName,
      skillType: acc.skillType,
      averageScore: acc.sum / acc.count,
      sampleCount: acc.count,
    }))
    .sort((a, b) => a.skillName.localeCompare(b.skillName, "pt-BR"));
}

/**
 * Gap por competência: converte a média de score para a escala de nível (0–3,
 * DP-06) e compara com o nível requerido do perfil aplicável. Skills sem
 * requerido no perfil são NO_REQUIREMENT (não cobram lacuna). `requiredBySkill`
 * mapeia skillId → nível requerido (enum); ausência = sem requerido.
 */
export function buildGap(
  radar: ReadonlyArray<RadarAxis>,
  requiredBySkill: ReadonlyMap<string, SkillLevel>,
): EvaluationGapRow[] {
  return radar.map((axis) => {
    const assessedWeight = scoreToLevelWeight(axis.averageScore);
    const requiredLevel = requiredBySkill.get(axis.skillId) ?? null;
    if (requiredLevel === null) {
      return {
        skillId: axis.skillId,
        skillName: axis.skillName,
        skillType: axis.skillType,
        averageScore: axis.averageScore,
        assessedWeight,
        requiredWeight: null,
        gap: null,
        status: "NO_REQUIREMENT",
      };
    }
    const requiredWeight = requiredLevelWeight(requiredLevel);
    const gap = requiredWeight - assessedWeight;
    return {
      skillId: axis.skillId,
      skillName: axis.skillName,
      skillType: axis.skillType,
      averageScore: axis.averageScore,
      assessedWeight,
      requiredWeight,
      // Tolerância pequena: arredondamentos da conversão não devem virar lacuna.
      gap,
      status: gap > 0.01 ? "GAP" : "MEETS",
    };
  });
}

/** Conta avaliadores submetidos por relacionamento (agregado, anonimizado). */
export function countRatersByRelationship(
  relationships: ReadonlyArray<EvaluationRelationship>,
): Partial<Record<EvaluationRelationship, number>> {
  const out: Partial<Record<EvaluationRelationship, number>> = {};
  for (const r of relationships) {
    out[r] = (out[r] ?? 0) + 1;
  }
  return out;
}

// ── Evolução histórica (US16.05) ────────────────────────────────────────────

/** Média por (ciclo, skill) usada para montar as séries históricas. */
export interface HistoryInput {
  cycleId: string;
  cycleName: string;
  periodEnd: string;
  skillId: string;
  skillName: string;
  skillType: "TECHNICAL" | "BEHAVIORAL";
  averageScore: number;
}

/**
 * Monta a série por competência ao longo dos ciclos fechados (mais antigo →
 * mais recente por periodEnd). Lida com skills adicionadas/removidas entre
 * ciclos sem quebrar a série: cada série só contém os pontos onde a skill foi
 * avaliada (US16.05). Ciclos devem vir ordenados por periodEnd ascendente.
 */
export function buildHistory(
  rows: ReadonlyArray<HistoryInput>,
): HistorySeries[] {
  const bySkill = new Map<
    string,
    {
      skillName: string;
      skillType: "TECHNICAL" | "BEHAVIORAL";
      points: HistoryPoint[];
    }
  >();
  // Ordena por periodEnd para uma série temporal coerente.
  const ordered = [...rows].sort((a, b) =>
    a.periodEnd.localeCompare(b.periodEnd),
  );
  for (const row of ordered) {
    const acc = bySkill.get(row.skillId) ?? {
      skillName: row.skillName,
      skillType: row.skillType,
      points: [],
    };
    acc.points.push({
      cycleId: row.cycleId,
      cycleName: row.cycleName,
      periodEnd: row.periodEnd,
      averageScore: row.averageScore,
    });
    bySkill.set(row.skillId, acc);
  }
  return [...bySkill.entries()]
    .map(([skillId, acc]) => ({
      skillId,
      skillName: acc.skillName,
      skillType: acc.skillType,
      points: acc.points,
    }))
    .sort((a, b) => a.skillName.localeCompare(b.skillName, "pt-BR"));
}
