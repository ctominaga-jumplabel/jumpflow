import { describe, expect, it } from "vitest";
import {
  buildMissingTimesheetRows,
  type AllocationInput,
  type TimeEntryInput,
} from "@jumpflow/shared";

/** Build an allocation, defaulting the descriptive fields. */
function alloc(
  consultantId: string,
  projectId: string,
  over: Partial<AllocationInput> = {},
): AllocationInput {
  return {
    consultantId,
    consultantName: consultantId,
    consultantEmail: `${consultantId}@x.com`,
    area: "Data",
    seniority: "SENIOR",
    projectId,
    projectName: projectId,
    ...over,
  };
}

function entry(
  consultantId: string,
  projectId: string,
  status: string,
): TimeEntryInput {
  return { consultantId, projectId, status };
}

describe("buildMissingTimesheetRows — acceptance criteria", () => {
  it("flags SEM_LANCAMENTO_NO_PROJETO when allocated with no entry at all", () => {
    const rows = buildMissingTimesheetRows([alloc("c1", "A")], []);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("SEM_LANCAMENTO_NO_PROJETO");
    expect(rows[0].loggedInOtherProject).toBe(false);
    expect(rows[0].projectId).toBe("A");
  });

  it("flags RASCUNHO_NAO_ENVIADO_NO_PROJETO when only DRAFT entries exist", () => {
    const rows = buildMissingTimesheetRows(
      [alloc("c1", "A")],
      [entry("c1", "A", "DRAFT")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("RASCUNHO_NAO_ENVIADO_NO_PROJETO");
  });

  it("flags RASCUNHO_NAO_ENVIADO_NO_PROJETO when only REJECTED entries exist (not effective submission)", () => {
    const rows = buildMissingTimesheetRows(
      [alloc("c1", "A")],
      [entry("c1", "A", "REJECTED")],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("RASCUNHO_NAO_ENVIADO_NO_PROJETO");
  });

  it.each(["SUBMITTED", "APPROVED", "CLOSED"])(
    "treats %s as compliant and emits no row",
    (status) => {
      const rows = buildMissingTimesheetRows(
        [alloc("c1", "A")],
        [entry("c1", "A", status)],
      );
      expect(rows).toHaveLength(0);
    },
  );

  it("reports the absent project even when the consultant logged elsewhere (loggedInOtherProject=true)", () => {
    // Allocated in A and B; SUBMITTED in B; nothing in A.
    const rows = buildMissingTimesheetRows(
      [alloc("c1", "A"), alloc("c1", "B")],
      [entry("c1", "B", "SUBMITTED")],
    );
    // B is compliant (effective submission) -> not reported. A is reported.
    expect(rows).toHaveLength(1);
    expect(rows[0].projectId).toBe("A");
    expect(rows[0].status).toBe("SEM_LANCAMENTO_NO_PROJETO");
    expect(rows[0].loggedInOtherProject).toBe(true);
  });

  it("only counts an EFFECTIVE submission elsewhere for loggedInOtherProject (DRAFT does not)", () => {
    const rows = buildMissingTimesheetRows(
      [alloc("c1", "A"), alloc("c1", "B")],
      [entry("c1", "B", "DRAFT")],
    );
    // Neither A nor B is compliant; B is a draft so it does not flag the others.
    const projectA = rows.find((r) => r.projectId === "A");
    const projectB = rows.find((r) => r.projectId === "B");
    expect(projectA?.loggedInOtherProject).toBe(false);
    expect(projectB?.loggedInOtherProject).toBe(false);
  });

  it("collapses multiple allocations to the same (consultant, project) into one row", () => {
    const rows = buildMissingTimesheetRows(
      [alloc("c1", "A"), alloc("c1", "A"), alloc("c1", "A")],
      [],
    );
    expect(rows).toHaveLength(1);
  });

  it("sorts stably by consultantName then projectName", () => {
    const rows = buildMissingTimesheetRows(
      [
        alloc("c2", "Zeta", { consultantName: "Bruno", projectName: "Zeta" }),
        alloc("c2", "Alfa", { consultantName: "Bruno", projectName: "Alfa" }),
        alloc("c1", "Beta", { consultantName: "Ana", projectName: "Beta" }),
      ],
      [],
    );
    expect(
      rows.map((r) => `${r.consultantName}/${r.projectName}`),
    ).toEqual(["Ana/Beta", "Bruno/Alfa", "Bruno/Zeta"]);
  });

  it("returns no rows when there are no allocations", () => {
    expect(buildMissingTimesheetRows([], [])).toHaveLength(0);
  });
});
