import { describe, expect, it } from "vitest";
import {
  buildPaymentExportRows,
  resolvePaymentDocument,
  resolvePaymentPixKey,
  type PaymentExportConsultant,
} from "./payment-export";

describe("resolvePaymentDocument", () => {
  it("prefers CNPJ over CPF", () => {
    expect(
      resolvePaymentDocument({ cnpj: "12.345.678/0001-90", cpf: "111.222.333-44" }),
    ).toBe("12.345.678/0001-90");
  });

  it("falls back to CPF when CNPJ is missing", () => {
    expect(resolvePaymentDocument({ cnpj: null, cpf: "111.222.333-44" })).toBe(
      "111.222.333-44",
    );
    expect(resolvePaymentDocument({ cnpj: "   ", cpf: "111.222.333-44" })).toBe(
      "111.222.333-44",
    );
  });

  it("returns empty string when neither exists", () => {
    expect(resolvePaymentDocument({ cnpj: null, cpf: null })).toBe("");
  });
});

describe("resolvePaymentPixKey", () => {
  it("uses the PJ account PIX (CLT_FLEX faturamento PJ)", () => {
    expect(
      resolvePaymentPixKey([
        { kind: "CLT", pixKey: "clt-pix" },
        { kind: "PJ", pixKey: "pj-pix" },
      ]),
    ).toBe("pj-pix");
  });

  it("falls back to PRIMARY when no PJ account has a PIX", () => {
    expect(
      resolvePaymentPixKey([
        { kind: "PRIMARY", pixKey: "primary-pix" },
        { kind: "PJ", pixKey: null },
      ]),
    ).toBe("primary-pix");
  });

  it("returns empty string when nothing usable is present", () => {
    expect(
      resolvePaymentPixKey([{ kind: "CLT", pixKey: "clt-pix" }]),
    ).toBe("");
    expect(resolvePaymentPixKey([])).toBe("");
  });
});

describe("buildPaymentExportRows", () => {
  it("emits one row per payment line, repeating document and PIX", () => {
    const consultants: PaymentExportConsultant[] = [
      {
        consultantName: "Ana",
        cnpj: "12.345.678/0001-90",
        cpf: "111.222.333-44",
        bankAccounts: [{ kind: "PJ", pixKey: "ana-pj-pix" }],
        lines: [
          { projectName: "Projeto A", amount: 1000 },
          { projectName: "Projeto B", amount: 500 },
        ],
      },
    ];
    expect(buildPaymentExportRows(consultants)).toEqual([
      {
        consultantName: "Ana",
        documentNumber: "12.345.678/0001-90",
        amount: 1000,
        projectName: "Projeto A",
        pixKey: "ana-pj-pix",
      },
      {
        consultantName: "Ana",
        documentNumber: "12.345.678/0001-90",
        amount: 500,
        projectName: "Projeto B",
        pixKey: "ana-pj-pix",
      },
    ]);
  });

  it("CLT_FLEX sem CNPJ cai para CPF e usa PIX PJ", () => {
    const consultants: PaymentExportConsultant[] = [
      {
        consultantName: "Bruno",
        cnpj: null,
        cpf: "999.888.777-66",
        bankAccounts: [
          { kind: "CLT", pixKey: "bruno-clt-pix" },
          { kind: "PJ", pixKey: "bruno-pj-pix" },
        ],
        lines: [{ projectName: "Projeto C", amount: 800 }],
      },
    ];
    expect(buildPaymentExportRows(consultants)).toEqual([
      {
        consultantName: "Bruno",
        documentNumber: "999.888.777-66",
        amount: 800,
        projectName: "Projeto C",
        pixKey: "bruno-pj-pix",
      },
    ]);
  });

  it("handles multiple consultants and empty document/PIX", () => {
    const consultants: PaymentExportConsultant[] = [
      {
        consultantName: "Sem dados",
        cnpj: null,
        cpf: null,
        bankAccounts: [],
        lines: [{ projectName: "Beneficios", amount: 200 }],
      },
    ];
    expect(buildPaymentExportRows(consultants)).toEqual([
      {
        consultantName: "Sem dados",
        documentNumber: "",
        amount: 200,
        projectName: "Beneficios",
        pixKey: "",
      },
    ]);
  });
});
