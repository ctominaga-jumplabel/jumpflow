import { describe, expect, it } from "vitest";
import { buildConsultantInvoiceRequestEmail } from "./templates";

const base = {
  consultantName: "Ana",
  month: 9,
  year: 2026,
  expectedAmount: 1600,
};

describe("buildConsultantInvoiceRequestEmail — por projeto", () => {
  it("keeps the single-NF copy without projects (backwards compatible)", () => {
    const email = buildConsultantInvoiceRequestEmail(base);
    expect(email.text).toContain("precisamos da sua nota fiscal");
    expect(email.text).not.toContain("UMA única NF");
  });

  it("shows the table but no per-project request with a single project", () => {
    const email = buildConsultantInvoiceRequestEmail({
      ...base,
      projects: [
        { projectName: "Alpha", clientName: "Cliente A", hours: 10, amount: 1600 },
      ],
    });
    expect(email.text).toContain("Projeto | Cliente | Horas | Valor");
    expect(email.text).toContain("Alpha | Cliente A");
    expect(email.text).not.toContain("UMA única NF");
  });

  it("keeps a SINGLE NF with the per-project table as reference (>1 project)", () => {
    const email = buildConsultantInvoiceRequestEmail({
      ...base,
      projects: [
        { projectName: "Alpha", clientName: "Cliente A", hours: 10, amount: 1000 },
        { projectName: "Beta", clientName: "Cliente B", hours: 5, amount: 600 },
      ],
      projectAmountsProportional: true,
    });
    expect(email.text).toContain("Emita UMA única NF com o valor previsto total");
    expect(email.text).toContain("apenas para referência");
    expect(email.text).not.toMatch(/uma NF por projeto/i);
    expect(email.text).toContain("Você atuou em 2 projetos");
    expect(email.text).toContain("Beta | Cliente B");
    expect(email.text).toContain("rateados proporcionalmente");
    expect(email.html).toContain("Cliente B");
  });
});
