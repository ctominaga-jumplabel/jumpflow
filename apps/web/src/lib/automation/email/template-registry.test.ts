import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  NOTIFICATION_EVENTS,
  blockKeysOf,
  getEmailTemplateDefinition,
  listTemplateDefinitions,
  variableKeysOf,
} from "./template-registry";
import { renderTemplateEmail, validateEmailTemplate } from "./template-renderer";
import {
  buildConsultantInvoiceRequestEmail,
  buildLiberacaoEmail,
  buildPaymentForecastEmail,
} from "./templates";
import {
  consultantInvoiceRequestTemplateVars,
  liberacaoTemplateVars,
  paymentForecastTemplateVars,
} from "./template-vars";

/** Lê o enum `NotificationEvent` direto do schema Prisma (fonte de verdade). */
function prismaNotificationEvents(): string[] {
  const schema = readFileSync(
    resolve(__dirname, "../../../../../../packages/database/prisma/schema.prisma"),
    "utf8",
  );
  const match = /enum NotificationEvent \{([\s\S]*?)\}/.exec(schema);
  if (!match) throw new Error("enum NotificationEvent não encontrado no schema");
  return match[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
}

describe("template registry — completeness", () => {
  it("mirrors every NotificationEvent of the Prisma schema", () => {
    expect([...NOTIFICATION_EVENTS].sort()).toEqual(prismaNotificationEvents().sort());
  });

  it("has a definition for every event", () => {
    const defs = listTemplateDefinitions();
    expect(defs.map((d) => d.event)).toEqual([...NOTIFICATION_EVENTS]);
    for (const def of defs) {
      expect(def.label.trim()).not.toBe("");
      if (!def.sendsEmail) expect(def.reason.trim()).not.toBe("");
    }
  });
});

describe("template registry — defaults", () => {
  const emailDefs = listTemplateDefinitions().filter((d) => d.sendsEmail);

  it.each(emailDefs.map((d) => [d.event]))(
    "%s: default only uses known variables and every block is listed",
    (event) => {
      const def = getEmailTemplateDefinition(event)!;
      const v = validateEmailTemplate({
        subject: def.defaultSubject,
        body: def.defaultBody,
        knownKeys: variableKeysOf(def),
        blockKeys: blockKeysOf(def),
      });
      expect(v.issues).toEqual([]);
      // Exemplo fornece todas as variáveis declaradas.
      const sample = def.sampleVars();
      for (const key of variableKeysOf(def)) {
        expect(Object.prototype.hasOwnProperty.call(sample, key), `${event}: ${key}`).toBe(true);
      }
    },
  );

  it.each(emailDefs.map((d) => [d.event]))(
    "%s: default renders with sample data without leftover placeholders",
    (event) => {
      const def = getEmailTemplateDefinition(event)!;
      const out = renderTemplateEmail({
        subject: def.defaultSubject,
        body: def.defaultBody,
        vars: def.sampleVars(),
        blockKeys: blockKeysOf(def),
        defaultTitle: def.defaultTitle,
        brand: def.brand,
      });
      expect(out.subject.length).toBeGreaterThan(0);
      expect(out.subject).not.toContain("{{");
      expect(out.html).not.toContain("{{");
      expect(out.text).not.toContain("{{");
    },
  );
});

describe("template registry — parity with the hardcoded builders", () => {
  it("HOURS_RELEASED default subject matches the builder", () => {
    const input = {
      recipientName: "Ana",
      projectName: "Portal",
      clientName: "ACME",
      periodLabel: "junho/2026",
      totalHours: 10,
      consultantsCount: 2,
    };
    const def = getEmailTemplateDefinition("HOURS_RELEASED")!;
    const out = renderTemplateEmail({
      subject: def.defaultSubject,
      body: def.defaultBody,
      vars: liberacaoTemplateVars(input),
      blockKeys: blockKeysOf(def),
      defaultTitle: def.defaultTitle,
    });
    const builder = buildLiberacaoEmail(input);
    expect(out.subject).toBe(builder.subject);
    expect(out.text).toContain(
      "As horas do projeto Portal (ACME) referentes à competência de junho/2026 foram liberadas",
    );
  });

  it("PAYMENT_FORECAST default subject matches the builder", () => {
    const input = {
      consultantName: "Ana",
      month: 6,
      year: 2026,
      totalAmount: 100,
      expectedPaymentAt: "2026-07-05",
      responseDeadlineAt: "2026-07-02",
    };
    const def = getEmailTemplateDefinition("PAYMENT_FORECAST")!;
    const out = renderTemplateEmail({
      subject: def.defaultSubject,
      body: def.defaultBody,
      vars: paymentForecastTemplateVars(input),
      blockKeys: blockKeysOf(def),
      defaultTitle: def.defaultTitle,
    });
    expect(out.subject).toBe(buildPaymentForecastEmail(input).subject);
  });

  it("CONSULTANT_INVOICE_REQUEST asks for one NF per project like the builder", () => {
    const input = {
      consultantName: "Ana",
      month: 6,
      year: 2026,
      expectedAmount: 200,
      projects: [
        { projectName: "A", clientName: "X", hours: 1, amount: 100 },
        { projectName: "B", clientName: "Y", hours: 1, amount: 100 },
      ],
    };
    const def = getEmailTemplateDefinition("CONSULTANT_INVOICE_REQUEST")!;
    const out = renderTemplateEmail({
      subject: def.defaultSubject,
      body: def.defaultBody,
      vars: consultantInvoiceRequestTemplateVars(input),
      blockKeys: blockKeysOf(def),
      defaultTitle: def.defaultTitle,
    });
    const builder = buildConsultantInvoiceRequestEmail(input);
    expect(out.subject).toBe(builder.subject);
    expect(out.text).toContain("precisamos das suas notas fiscais (NF)");
    expect(out.text).toContain("emita UMA NF por projeto");
  });
});
