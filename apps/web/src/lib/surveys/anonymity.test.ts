import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_IDENTITY_KEYS,
  buildAnonymousSurveyResponse,
  invitationCanRespond,
  nextInvitationStatusOnSubmit,
  resolveResponseInvitationLink,
} from "./anonymity";

/**
 * ANONIMATO É REQUISITO CENTRAL. These tests are the executable guarantee that
 * the data we hand to Prisma for an anonymous survey carries NO identity and NO
 * reverse link to the invitation (which knows the consultant).
 */

describe("resolveResponseInvitationLink", () => {
  it("returns null for anonymous surveys (no reverse link to identity)", () => {
    expect(
      resolveResponseInvitationLink({ anonymous: true, invitationId: "inv1" }),
    ).toBeNull();
  });

  it("returns the invitationId for non-anonymous surveys", () => {
    expect(
      resolveResponseInvitationLink({ anonymous: false, invitationId: "inv1" }),
    ).toBe("inv1");
  });
});

describe("buildAnonymousSurveyResponse — non-reidentification", () => {
  const answers = [
    { questionId: "q1", scoreValue: 9, choiceValue: null, textValue: null },
    { questionId: "q2", scoreValue: null, choiceValue: "Sim", textValue: null },
  ];

  it("never includes any identity key in the create payload (anonymous)", () => {
    const data = buildAnonymousSurveyResponse({
      surveyId: "s1",
      anonymous: true,
      invitationId: "inv1",
      submittedAt: new Date("2026-06-19T00:00:00Z"),
      answers,
    });
    const serialized = JSON.stringify(data);
    for (const key of FORBIDDEN_IDENTITY_KEYS) {
      expect(serialized).not.toContain(key);
    }
    // The whole object's own keys must be a closed, identity-free set.
    expect(Object.keys(data).sort()).toEqual(
      ["answers", "invitationId", "submittedAt", "surveyId"].sort(),
    );
  });

  it("forces invitationId to null for anonymous surveys", () => {
    const data = buildAnonymousSurveyResponse({
      surveyId: "s1",
      anonymous: true,
      invitationId: "inv1",
      submittedAt: new Date(),
      answers,
    });
    expect(data.invitationId).toBeNull();
  });

  it("keeps the invitation link only when the survey is NOT anonymous", () => {
    const data = buildAnonymousSurveyResponse({
      surveyId: "s1",
      anonymous: false,
      invitationId: "inv1",
      submittedAt: new Date(),
      answers,
    });
    expect(data.invitationId).toBe("inv1");
  });

  it("carries only per-question values in the nested answers (no author marks)", () => {
    const data = buildAnonymousSurveyResponse({
      surveyId: "s1",
      anonymous: true,
      invitationId: "inv1",
      submittedAt: new Date(),
      answers,
    });
    for (const a of data.answers.create) {
      expect(Object.keys(a).sort()).toEqual(
        ["choiceValue", "questionId", "scoreValue", "textValue"].sort(),
      );
    }
  });
});

describe("invitation lifecycle", () => {
  it("only PENDING invitations can respond", () => {
    expect(invitationCanRespond("PENDING")).toBe(true);
    expect(invitationCanRespond("ANSWERED")).toBe(false);
    expect(invitationCanRespond("EXPIRED")).toBe(false);
  });

  it("PENDING → ANSWERED on submit, idempotent otherwise", () => {
    expect(nextInvitationStatusOnSubmit("PENDING")).toBe("ANSWERED");
    expect(nextInvitationStatusOnSubmit("ANSWERED")).toBe("ANSWERED");
    expect(nextInvitationStatusOnSubmit("EXPIRED")).toBe("EXPIRED");
  });
});
