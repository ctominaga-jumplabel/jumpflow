import { describe, expect, it } from "vitest";
import {
  classifyConsultantReadiness,
  isExceptionEntry,
  pendingAlert,
  summarizeOverview,
  summarizeReadiness,
  type ConsultantReadiness,
  type OperationClosingRow,
} from "./closing";

describe("isExceptionEntry", () => {
  it("is false for a plain workday with no attachment", () => {
    expect(
      isExceptionEntry({ activityType: "WORKDAY", hasAttachment: false }),
    ).toBe(false);
  });

  it("is true for any non-workday activity", () => {
    expect(
      isExceptionEntry({ activityType: "ON_CALL", hasAttachment: false }),
    ).toBe(true);
    expect(
      isExceptionEntry({ activityType: "ABSENCE", hasAttachment: false }),
    ).toBe(true);
  });

  it("is true for a workday that carries an attachment", () => {
    expect(
      isExceptionEntry({ activityType: "WORKDAY", hasAttachment: true }),
    ).toBe(true);
  });
});

describe("classifyConsultantReadiness", () => {
  it("returns NO_ENTRIES when there are no entries", () => {
    expect(classifyConsultantReadiness([])).toBe("NO_ENTRIES");
  });

  it("prioritizes REJECTED over everything else", () => {
    expect(
      classifyConsultantReadiness(["APPROVED", "SUBMITTED", "REJECTED"]),
    ).toBe("REJECTED");
  });

  it("flags DRAFT before SUBMITTED", () => {
    expect(classifyConsultantReadiness(["APPROVED", "DRAFT", "SUBMITTED"])).toBe(
      "DRAFT",
    );
  });

  it("flags PENDING_REVIEW when only submitted/approved remain", () => {
    expect(classifyConsultantReadiness(["APPROVED", "SUBMITTED"])).toBe(
      "PENDING_REVIEW",
    );
  });

  it("is APPROVED only when all entries are approved or closed", () => {
    expect(classifyConsultantReadiness(["APPROVED", "APPROVED"])).toBe(
      "APPROVED",
    );
    expect(classifyConsultantReadiness(["APPROVED", "CLOSED"])).toBe("APPROVED");
  });
});

function consultant(
  partial: Partial<ConsultantReadiness> & { state: ConsultantReadiness["state"] },
): ConsultantReadiness {
  return {
    consultantId: partial.consultantId ?? "c1",
    consultantName: partial.consultantName ?? "Zé",
    hours: partial.hours ?? 8,
    state: partial.state,
  };
}

describe("summarizeReadiness", () => {
  it("can close only when there is a team and all are approved", () => {
    const ready = summarizeReadiness([
      consultant({ consultantId: "a", consultantName: "Ana", state: "APPROVED" }),
      consultant({ consultantId: "b", consultantName: "Bia", state: "APPROVED" }),
    ]);
    expect(ready.canClose).toBe(true);
    expect(ready.readyConsultants).toBe(2);
    expect(ready.pendingConsultants).toBe(0);
  });

  it("blocks when any consultant is pending", () => {
    const r = summarizeReadiness([
      consultant({ consultantId: "a", state: "APPROVED", hours: 10 }),
      consultant({ consultantId: "b", state: "PENDING_REVIEW", hours: 5 }),
    ]);
    expect(r.canClose).toBe(false);
    expect(r.pendingByState.PENDING_REVIEW).toBe(1);
    expect(r.totalHours).toBe(15);
  });

  it("cannot close an empty team", () => {
    const r = summarizeReadiness([]);
    expect(r.canClose).toBe(false);
    expect(r.totalConsultants).toBe(0);
  });

  it("sorts consultants by name (pt-BR)", () => {
    const r = summarizeReadiness([
      consultant({ consultantId: "z", consultantName: "Zélia", state: "APPROVED" }),
      consultant({ consultantId: "a", consultantName: "Ália", state: "APPROVED" }),
    ]);
    expect(r.consultants.map((c) => c.consultantName)).toEqual([
      "Ália",
      "Zélia",
    ]);
  });
});

describe("pendingAlert", () => {
  it("is empty when ready to close", () => {
    const r = summarizeReadiness([consultant({ state: "APPROVED" })]);
    expect(pendingAlert(r)).toBe("");
  });

  it("describes the team gap when there is no team", () => {
    expect(pendingAlert(summarizeReadiness([]))).toBe(
      "Sem equipe alocada no mês",
    );
  });

  it("summarizes the pending states", () => {
    const r = summarizeReadiness([
      consultant({ consultantId: "a", state: "PENDING_REVIEW" }),
      consultant({ consultantId: "b", state: "PENDING_REVIEW" }),
      consultant({ consultantId: "c", state: "DRAFT" }),
    ]);
    expect(pendingAlert(r)).toBe("2 aguardando aprovação · 1 em rascunho");
  });
});

describe("summarizeOverview", () => {
  const baseReadiness = summarizeReadiness([
    consultant({ state: "APPROVED" }),
  ]);
  function row(
    partial: Partial<OperationClosingRow> & {
      status: OperationClosingRow["status"];
    },
  ): OperationClosingRow {
    return {
      projectId: partial.projectId ?? "p",
      projectName: partial.projectName ?? "Projeto",
      clientName: partial.clientName ?? "Cliente",
      closingId: partial.closingId ?? null,
      status: partial.status,
      closedAt: partial.closedAt ?? null,
      closedByName: partial.closedByName ?? null,
      notifiedAt: partial.notifiedAt ?? null,
      readiness: partial.readiness ?? baseReadiness,
      exceptionCount: partial.exceptionCount ?? 0,
    };
  }

  it("counts pending, ready-to-close and closed", () => {
    const overview = summarizeOverview(6, 2026, [
      row({ projectId: "1", status: "CLOSED" }),
      row({ projectId: "2", status: "OPEN", readiness: baseReadiness }),
      row({
        projectId: "3",
        status: "OPEN",
        readiness: summarizeReadiness([consultant({ state: "DRAFT" })]),
      }),
    ]);
    expect(overview.closedCount).toBe(1);
    expect(overview.pendingCount).toBe(2);
    expect(overview.readyToCloseCount).toBe(1);
  });
});
