import { describe, expect, it } from "vitest";
import { buildFeedbackRequestEmail } from "./feedback-request-template";

describe("buildFeedbackRequestEmail", () => {
  it("anchors on the project and names the consultant", () => {
    const email = buildFeedbackRequestEmail({
      contactName: "Maria",
      consultantName: "Bruno Lima",
      projectName: "Projeto Alpha",
      clientName: "Cliente X",
      requesterName: "Ana Martins",
      note: "Foco na entrega do trimestre.",
    });

    expect(email.subject).toContain("Bruno Lima");
    expect(email.text).toContain("Prezado(a) Maria,");
    expect(email.text).toContain("Bruno Lima");
    expect(email.text).toContain("Projeto Alpha");
    expect(email.text).toContain("Foco na entrega do trimestre.");
    // Client-facing: instrui responder ao e-mail (sem link externo).
    expect(email.text.toLowerCase()).toContain("responder a este e-mail");
    // Assinatura inclui o solicitante.
    expect(email.text).toContain("Ana Martins");
  });

  it("works without project/note (generic anchor, no client block)", () => {
    const email = buildFeedbackRequestEmail({
      consultantName: "Marina Alves",
    });
    expect(email.subject).toContain("Marina Alves");
    expect(email.text).toContain("Prezado(a),");
    expect(email.text).toContain("no trabalho realizado");
    expect(email.text).not.toContain("Projeto");
  });

  it("never exposes internal/financial tokens", () => {
    const email = buildFeedbackRequestEmail({
      consultantName: "Carlos Nunes",
      projectName: "Projeto Beta",
      note: "Obrigado pela parceria.",
    });
    const haystack = `${email.subject} ${email.text}`.toLowerCase();
    for (const forbidden of [
      "custo",
      "valor",
      "remunera",
      "salario",
      "margem",
      "hourly",
    ]) {
      expect(haystack).not.toContain(forbidden);
    }
  });
});
