import { describe, expect, it } from "vitest";
import {
  COURSE_EVIDENCE_SOURCE,
  decideCourseEvidence,
  deriveProgressUpdate,
} from "./enrollment";

describe("deriveProgressUpdate — transição de status por progresso", () => {
  it("0% mantém ENROLLED", () => {
    const u = deriveProgressUpdate("ENROLLED", 0, 0);
    expect(u?.status).toBe("ENROLLED");
    expect(u?.becameCompleted).toBe(false);
  });

  it("progresso parcial → IN_PROGRESS", () => {
    const u = deriveProgressUpdate("ENROLLED", 40, 4);
    expect(u?.status).toBe("IN_PROGRESS");
    expect(u?.progressPct).toBe(40);
    expect(u?.hoursCompleted).toBe(4);
    expect(u?.becameCompleted).toBe(false);
  });

  it("100% → COMPLETED e becameCompleted true (transição)", () => {
    const u = deriveProgressUpdate("IN_PROGRESS", 100, 10);
    expect(u?.status).toBe("COMPLETED");
    expect(u?.becameCompleted).toBe(true);
  });

  it("acima de 100% satura em 100 e conclui", () => {
    const u = deriveProgressUpdate("ENROLLED", 150, 10);
    expect(u?.progressPct).toBe(100);
    expect(u?.status).toBe("COMPLETED");
    expect(u?.becameCompleted).toBe(true);
  });

  it("matrícula já COMPLETED é terminal (null) — não reprocessa evidência", () => {
    expect(deriveProgressUpdate("COMPLETED", 100, 10)).toBeNull();
  });

  it("matrícula CANCELLED é terminal (null)", () => {
    expect(deriveProgressUpdate("CANCELLED", 50, 5)).toBeNull();
  });

  it("normaliza horas negativas para 0", () => {
    const u = deriveProgressUpdate("ENROLLED", 50, -3);
    expect(u?.hoursCompleted).toBe(0);
  });
});

describe("decideCourseEvidence — registro idempotente na conclusão", () => {
  it("sem ConsultantSkill (skill não possuída): não registra", () => {
    const d = decideCourseEvidence({
      enrollmentId: "enr1",
      courseTitle: "AWS",
      consultantSkillId: null,
      alreadyRecorded: false,
    });
    expect(d.shouldRecord).toBe(false);
  });

  it("com ConsultantSkill e sem evidência prévia: registra", () => {
    const d = decideCourseEvidence({
      enrollmentId: "enr1",
      courseTitle: "AWS",
      consultantSkillId: "cs1",
      alreadyRecorded: false,
    });
    expect(d.shouldRecord).toBe(true);
    expect(d.sourceType).toBe(COURSE_EVIDENCE_SOURCE);
    expect(d.sourceType).toBe("MANUAL");
    expect(d.sourceId).toBe("enr1"); // idempotência por matrícula
    expect(d.note).toContain("AWS");
  });

  it("evidência já registrada para a matrícula: não duplica (idempotente)", () => {
    const d = decideCourseEvidence({
      enrollmentId: "enr1",
      courseTitle: "AWS",
      consultantSkillId: "cs1",
      alreadyRecorded: true,
    });
    expect(d.shouldRecord).toBe(false);
  });
});
