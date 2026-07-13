import { describe, expect, it } from "vitest";
import {
  buildFeriadoProximoEmail,
  type FeriadoProximoLine,
} from "./templates";

function line(
  dateLabel: string,
  name: string,
  scopeLabel?: string,
): FeriadoProximoLine {
  return { dateLabel, name, scopeLabel };
}

describe("buildFeriadoProximoEmail", () => {
  it("uses singular copy/subject for a single holiday and lists it", () => {
    const email = buildFeriadoProximoEmail({
      recipientName: "Ana",
      holidays: [line("07/09/2026", "Independência do Brasil", "Nacional")],
      daysAhead: 7,
    });

    // Singular subject names the holiday + date.
    expect(email.subject).toContain("Feriado próximo");
    expect(email.subject).toContain("Independência do Brasil");
    expect(email.subject).toContain("07/09/2026");
    // Not the plural form.
    expect(email.subject).not.toMatch(/feriados próximos/);

    // Body greets the recipient and lists the holiday.
    expect(email.text).toContain("Olá, Ana.");
    expect(email.text).toContain("Independência do Brasil");
    expect(email.text).toContain("07/09/2026");
    expect(email.text).toContain("Nacional");
    // Singular callout mentions "um feriado" and the window.
    expect(email.text).toContain("um feriado");
    expect(email.text).toContain("próximos 7 dias");
  });

  it("uses plural copy/subject for multiple holidays and lists all of them", () => {
    const email = buildFeriadoProximoEmail({
      recipientName: "equipe",
      holidays: [
        line("24/12/2026", "Véspera de Natal", "SP"),
        line("25/12/2026", "Natal", "Nacional"),
      ],
      daysAhead: 3,
    });

    // Plural subject counts the holidays.
    expect(email.subject).toContain("2 feriados próximos");
    // Plural callout counts the holidays and mentions the window.
    expect(email.text).toContain("há 2 feriados");
    expect(email.text).toContain("próximos 3 dias");

    // Every holiday is listed.
    expect(email.text).toContain("Véspera de Natal");
    expect(email.text).toContain("24/12/2026");
    expect(email.text).toContain("Natal");
    expect(email.text).toContain("25/12/2026");
  });

  it("adds the coverage (Abrangência) column only when a scope label is present", () => {
    const withScope = buildFeriadoProximoEmail({
      recipientName: "Ana",
      holidays: [line("25/12/2026", "Natal", "Nacional")],
    });
    expect(withScope.text).toContain("Abrangência");

    const withoutScope = buildFeriadoProximoEmail({
      recipientName: "Ana",
      holidays: [line("25/12/2026", "Natal")],
    });
    expect(withoutScope.text).not.toContain("Abrangência");
    // Holiday still listed even without a coverage column.
    expect(withoutScope.text).toContain("Natal");
  });

  it("omits the day-window copy when daysAhead is not provided", () => {
    const email = buildFeriadoProximoEmail({
      recipientName: "Ana",
      holidays: [line("25/12/2026", "Natal")],
    });
    expect(email.text).not.toMatch(/próximos \d+ dias/);
  });
});
