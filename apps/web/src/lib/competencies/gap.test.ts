import { describe, expect, it } from "vitest";
import {
  aggregateTeamGap,
  computeCell,
  filterMatrixByType,
  resolveApplicableProfile,
  SCOPE_PRECEDENCE,
  type ResolvableProfile,
} from "./gap";
import type {
  CompetencyMatrix,
  MatrixConsultantRow,
  MatrixSkillColumn,
} from "./types";

const profile = (over: Partial<ResolvableProfile>): ResolvableProfile => ({
  id: "p1",
  name: "Perfil",
  scope: "SENIORITY",
  referenceKey: "SENIOR",
  status: "ACTIVE",
  ...over,
});

describe("resolveApplicableProfile (US13.03, DP-02)", () => {
  it("precedence is ROLE > SENIORITY > AREA", () => {
    expect(SCOPE_PRECEDENCE).toEqual(["ROLE", "SENIORITY", "AREA"]);
  });

  it("prefers ROLE over SENIORITY and AREA when consultant matches all", () => {
    // jobTitle normaliza para MAIÚSCULAS preservando espaços, então a
    // referenceKey do perfil ROLE deve casar o jobTitle exato ("TECH LEAD").
    const profiles = [
      profile({ id: "role", scope: "ROLE", referenceKey: "TECH LEAD" }),
      profile({ id: "sen", scope: "SENIORITY", referenceKey: "SENIOR" }),
      profile({ id: "area", scope: "AREA", referenceKey: "DATA" }),
    ];
    const result = resolveApplicableProfile(
      { jobTitle: "Tech Lead", seniority: "SENIOR", area: "Data" },
      profiles,
    );
    expect(result?.id).toBe("role");
  });

  it("falls back to SENIORITY when no ROLE profile matches", () => {
    const profiles = [
      profile({ id: "role", scope: "ROLE", referenceKey: "MANAGER" }),
      profile({ id: "sen", scope: "SENIORITY", referenceKey: "SENIOR" }),
    ];
    const result = resolveApplicableProfile(
      { jobTitle: "Tech Lead", seniority: "Senior", area: null },
      profiles,
    );
    expect(result?.id).toBe("sen");
  });

  it("matches case-insensitively (referenceKey is uppercased)", () => {
    const profiles = [profile({ scope: "AREA", referenceKey: "DATA" })];
    const result = resolveApplicableProfile(
      { jobTitle: null, seniority: "JUNIOR", area: "data" },
      profiles,
    );
    expect(result?.id).toBe("p1");
  });

  it("ignores INACTIVE profiles", () => {
    const profiles = [
      profile({ id: "sen", scope: "SENIORITY", referenceKey: "SENIOR", status: "INACTIVE" }),
    ];
    expect(
      resolveApplicableProfile(
        { jobTitle: null, seniority: "SENIOR", area: null },
        profiles,
      ),
    ).toBeNull();
  });

  it("returns null when nothing matches (gap indefinido, não erro)", () => {
    const profiles = [profile({ scope: "SENIORITY", referenceKey: "PRINCIPAL" })];
    expect(
      resolveApplicableProfile(
        { jobTitle: null, seniority: "JUNIOR", area: null },
        profiles,
      ),
    ).toBeNull();
  });
});

describe("computeCell (US14.02)", () => {
  it("NO_PROFILE when consultant has no applicable profile", () => {
    const cell = computeCell("s1", null, "BASIC", false);
    expect(cell.status).toBe("NO_PROFILE");
    expect(cell.gap).toBeNull();
  });

  it("NOT_ASSESSED when required exists but no current level", () => {
    const cell = computeCell("s1", "ADVANCED", null, true);
    expect(cell.status).toBe("NOT_ASSESSED");
    expect(cell.gap).toBeNull();
  });

  it("GAP with positive gap when current < required", () => {
    const cell = computeCell("s1", "SPECIALIST", "BASIC", true);
    expect(cell.status).toBe("GAP");
    expect(cell.gap).toBe(3); // 3 - 0
  });

  it("MEETS with zero/negative gap when current >= required", () => {
    expect(computeCell("s1", "BASIC", "BASIC", true).status).toBe("MEETS");
    expect(computeCell("s1", "BASIC", "ADVANCED", true).gap).toBe(-2);
  });

  it("skill outside the profile is MEETS with null gap (not a lacuna)", () => {
    const cell = computeCell("s1", null, "BASIC", true);
    expect(cell.status).toBe("MEETS");
    expect(cell.gap).toBeNull();
  });
});

const skillCol = (id: string, name: string): MatrixSkillColumn => ({
  skillId: id,
  skillName: name,
  skillType: "TECHNICAL",
});

const row = (
  id: string,
  cells: MatrixConsultantRow["cells"],
): MatrixConsultantRow => ({
  consultantId: id,
  consultantName: id,
  seniority: "SENIOR",
  area: null,
  jobTitle: null,
  profileId: "p1",
  profileName: "Perfil",
  cells,
});

describe("aggregateTeamGap (US14.03)", () => {
  it("counts below + averages only assessed cells with required defined", () => {
    const columns = [skillCol("a", "Alpha"), skillCol("b", "Beta")];
    const rows = [
      row("c1", [
        computeCell("a", "SPECIALIST", "BASIC", true), // gap 3
        computeCell("b", "BASIC", "ADVANCED", true), // gap -2 (meets)
      ]),
      row("c2", [
        computeCell("a", "ADVANCED", "INTERMEDIATE", true), // gap 1
        computeCell("b", "ADVANCED", null, true), // not assessed -> ignored
      ]),
    ];
    const team = aggregateTeamGap(rows, columns);
    const alpha = team.find((t) => t.skillId === "a")!;
    expect(alpha.belowCount).toBe(2);
    expect(alpha.assessedCount).toBe(2);
    expect(alpha.averageGap).toBe(2); // (3 + 1) / 2
    const beta = team.find((t) => t.skillId === "b")!;
    expect(beta.assessedCount).toBe(1);
    expect(beta.belowCount).toBe(0);
  });

  it("sorts by highest average gap first", () => {
    const columns = [skillCol("a", "Alpha"), skillCol("b", "Beta")];
    const rows = [
      row("c1", [
        computeCell("a", "INTERMEDIATE", "BASIC", true), // gap 1
        computeCell("b", "SPECIALIST", "BASIC", true), // gap 3
      ]),
    ];
    const team = aggregateTeamGap(rows, columns);
    expect(team[0].skillId).toBe("b");
  });

  it("omits skills with no assessed cells", () => {
    const columns = [skillCol("a", "Alpha")];
    const rows = [row("c1", [computeCell("a", "ADVANCED", null, true)])];
    expect(aggregateTeamGap(rows, columns)).toHaveLength(0);
  });
});

describe("filterMatrixByType", () => {
  const matrix: CompetencyMatrix = {
    skills: [
      { skillId: "a", skillName: "Alpha", skillType: "TECHNICAL" },
      { skillId: "b", skillName: "Beta", skillType: "BEHAVIORAL" },
    ],
    consultants: [
      row("c1", [
        computeCell("a", "BASIC", "BASIC", true),
        computeCell("b", "BASIC", "BASIC", true),
      ]),
    ],
  };

  it("keeps only columns/cells of the requested type", () => {
    const tech = filterMatrixByType(matrix, "TECHNICAL");
    expect(tech.skills.map((s) => s.skillId)).toEqual(["a"]);
    expect(tech.consultants[0].cells.map((c) => c.skillId)).toEqual(["a"]);
  });

  it("returns the matrix unchanged for ALL", () => {
    expect(filterMatrixByType(matrix, "ALL")).toBe(matrix);
  });
});
