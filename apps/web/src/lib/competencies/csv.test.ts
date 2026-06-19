import { describe, expect, it } from "vitest";
import { buildMatrixCsv, buildTeamGapCsv } from "./csv";
import { computeCell } from "./gap";
import type { CompetencyMatrix, TeamGapRow } from "./types";

const BOM = "﻿";

function lines(csv: string): string[] {
  expect(csv.startsWith(BOM)).toBe(true);
  expect(csv.endsWith("\r\n")).toBe(true);
  return csv
    .slice(BOM.length)
    .split("\r\n")
    .filter((l) => l.length > 0);
}

describe("buildMatrixCsv", () => {
  const matrix: CompetencyMatrix = {
    skills: [{ skillId: "a", skillName: "React", skillType: "TECHNICAL" }],
    consultants: [
      {
        consultantId: "c1",
        consultantName: "Ana",
        seniority: "SENIOR",
        area: "Frontend",
        jobTitle: null,
        profileId: "p1",
        profileName: "Dev Sênior",
        cells: [computeCell("a", "SPECIALIST", "BASIC", true)],
      },
    ],
  };

  it("emits a stable header even with no data rows", () => {
    const csv = buildMatrixCsv({ skills: [], consultants: [] });
    const rows = lines(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("consultor");
    expect(rows[0]).toContain("gap");
  });

  it("emits one row per (consultor, skill) with gap and situação", () => {
    const rows = lines(buildMatrixCsv(matrix));
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"Ana"');
    expect(rows[1]).toContain('"React"');
    expect(rows[1]).toContain('"3"'); // gap weight diff
    expect(rows[1]).toContain('"Lacuna"');
  });

  it("skips cells with neither required nor current level", () => {
    const empty: CompetencyMatrix = {
      skills: [{ skillId: "a", skillName: "React", skillType: "TECHNICAL" }],
      consultants: [
        {
          ...matrix.consultants[0],
          cells: [computeCell("a", null, null, true)],
        },
      ],
    };
    expect(lines(buildMatrixCsv(empty))).toHaveLength(1); // header only
  });
});

describe("buildTeamGapCsv", () => {
  it("emits header + one row per skill with 2-decimal average", () => {
    const team: TeamGapRow[] = [
      {
        skillId: "a",
        skillName: "React",
        skillType: "TECHNICAL",
        belowCount: 2,
        assessedCount: 3,
        averageGap: 1.5,
      },
    ];
    const rows = lines(buildTeamGapCsv(team));
    expect(rows[0]).toContain("gapMedio");
    expect(rows[1]).toContain('"React"');
    expect(rows[1]).toContain('"1.50"');
  });
});
