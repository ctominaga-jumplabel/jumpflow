import { csvField, sanitizeText } from "@/lib/reports/csv";
import {
  skillLevelLabels,
  skillTypeLabels,
  type CompetencyMatrix,
  type GapStatus,
  type SkillLevel,
  type TeamGapRow,
} from "./types";

/**
 * Pure CSV builders for the Competências gap analysis (EP14 US14.03 — exportável
 * consistente com os relatórios do MVP). Reusa o helper de relatórios: BOM
 * UTF-8, header estável, `\r\n` e quebra final. Sem I/O — testável.
 */

const BOM = "﻿";
const EOL = "\r\n";

function text(value: string | null | undefined): string {
  return csvField(sanitizeText(value ?? ""));
}

function level(value: SkillLevel | null): string {
  return text(value ? skillLevelLabels[value] : "");
}

function joinLines(lines: string[]): string {
  return BOM + lines.join(EOL) + EOL;
}

const STATUS_LABELS: Record<GapStatus, string> = {
  GAP: "Lacuna",
  MEETS: "Atende",
  NOT_ASSESSED: "Não avaliada",
  NO_PROFILE: "Sem perfil",
};

const MATRIX_HEADERS = [
  "consultor",
  "senioridade",
  "area",
  "cargo",
  "perfil",
  "skill",
  "tipo",
  "requerido",
  "atual",
  "gap",
  "situacao",
] as const;

/**
 * Matriz detalhada: uma linha por (consultor, skill). Inclui só células que
 * fazem parte do perfil aplicável OU que têm nível atual declarado (evita ruído
 * de skills irrelevantes ao consultor). Para consultor sem perfil, exporta as
 * skills avaliadas com situação "Sem perfil".
 */
export function buildMatrixCsv(matrix: CompetencyMatrix): string {
  const skillById = new Map(matrix.skills.map((s) => [s.skillId, s]));
  const lines: string[] = [MATRIX_HEADERS.map((h) => csvField(h)).join(",")];
  for (const row of matrix.consultants) {
    for (const cell of row.cells) {
      const skill = skillById.get(cell.skillId);
      if (!skill) continue;
      // Pula combinações sem requerido E sem atual (nada a dizer).
      if (cell.requiredLevel === null && cell.currentLevel === null) continue;
      lines.push(
        [
          text(row.consultantName),
          text(row.seniority),
          text(row.area),
          text(row.jobTitle),
          text(row.profileName),
          text(skill.skillName),
          text(skillTypeLabels[skill.skillType]),
          level(cell.requiredLevel),
          level(cell.currentLevel),
          csvField(cell.gap === null ? "" : String(cell.gap)),
          text(STATUS_LABELS[cell.status]),
        ].join(","),
      );
    }
  }
  return joinLines(lines);
}

const TEAM_HEADERS = [
  "skill",
  "tipo",
  "consultoresAbaixo",
  "consultoresAvaliados",
  "gapMedio",
] as const;

/** Visão agregada por skill (maior gap primeiro). */
export function buildTeamGapCsv(rows: ReadonlyArray<TeamGapRow>): string {
  const lines: string[] = [TEAM_HEADERS.map((h) => csvField(h)).join(",")];
  for (const row of rows) {
    lines.push(
      [
        text(row.skillName),
        text(skillTypeLabels[row.skillType]),
        csvField(String(row.belowCount)),
        csvField(String(row.assessedCount)),
        csvField(row.averageGap.toFixed(2)),
      ].join(","),
    );
  }
  return joinLines(lines);
}
