import { describe, expect, it } from "vitest";

import {
  CRM_CONTRACT_SCHEMA_VERSION,
  crmProjectPayloadSchema,
} from "./contract";

/**
 * Zod contract for the CRM -> JumpFlow ingestion payload (contrato v1 §2). The
 * example from the contract must pass; billing carries ONLY `crmBillingModel`;
 * missing required fields fail; CNPJ is normalized to 14 digits.
 */
function validPayload(): Record<string, unknown> {
  return {
    schemaVersion: "1.0",
    eventType: "project.won",
    idempotencyKey: "crm-proposal-PROP-2026-0142-r1",
    occurredAt: "2026-07-14T13:00:00Z",
    revision: 1,
    correlation: {
      crmProposalReferenceId: "PROP-2026-0142",
      crmProposalId: 142,
      commercialContractRef: "PROP-2026-0142",
    },
    project: {
      title: "Plataforma de Cobrança — Fase 1",
      opportunityType: "PROJECT",
      timesheetMode: "TIMESHEET",
      contractStart: "2026-08-01T00:00:00Z",
      contractEnd: "2026-12-31T00:00:00Z",
      budgetHoursTotal: 1200,
      totalContractValue: 480000.0,
      currency: "BRL",
      billing: { crmBillingModel: "FIXED" },
    },
    client: {
      crmClientId: 88,
      document: "12345678000199",
      name: "Acme S.A.",
      size: "LARGE",
      clientArea: { crmAreaId: 17, name: "TI - Pagamentos" },
    },
    accountExecutive: {
      crmUserId: 12,
      email: "exec@jumplabel.com.br",
      name: "Fulano de Tal",
    },
    plannedProfiles: [
      {
        crmLineId: 5011,
        jobRoleSlug: "desenvolvedor",
        jobRoleName: "Desenvolvedor",
        seniority: "SENIOR",
        quantity: 2,
        budgetHours: 640,
        saleUnitValue: 150.0,
        saleLineValue: 96000.0,
      },
    ],
  };
}

describe("crmProjectPayloadSchema", () => {
  it("accepts the frozen v1 example payload", () => {
    const parsed = crmProjectPayloadSchema.safeParse(validPayload());
    expect(parsed.success).toBe(true);
  });

  it("accepts billing with only crmBillingModel", () => {
    const payload = validPayload();
    const parsed = crmProjectPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.project.billing).toEqual({ crmBillingModel: "FIXED" });
    }
  });

  it("normalizes a masked CNPJ down to 14 digits", () => {
    const payload = validPayload();
    (payload.client as Record<string, unknown>).document =
      "12.345.678/0001-99";
    const parsed = crmProjectPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.client.document).toBe("12345678000199");
    }
  });

  it("rejects a CNPJ that is not 14 digits after normalization", () => {
    const payload = validPayload();
    (payload.client as Record<string, unknown>).document = "123";
    const parsed = crmProjectPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it("fails when a required field (commercialContractRef) is missing", () => {
    const payload = validPayload();
    delete (payload.correlation as Record<string, unknown>)
      .commercialContractRef;
    const parsed = crmProjectPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
  });

  it("defaults plannedProfiles to an empty array when absent", () => {
    const payload = validPayload();
    delete payload.plannedProfiles;
    const parsed = crmProjectPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.plannedProfiles).toEqual([]);
    }
  });

  it("rejects an unknown schemaVersion", () => {
    const payload = validPayload();
    payload.schemaVersion = "2.0";
    const parsed = crmProjectPayloadSchema.safeParse(payload);
    expect(parsed.success).toBe(false);
    // sanity: the accepted version is the frozen one
    expect(CRM_CONTRACT_SCHEMA_VERSION).toBe("1.0");
  });
});
