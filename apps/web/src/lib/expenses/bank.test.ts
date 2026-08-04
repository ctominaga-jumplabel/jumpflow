import { describe, expect, it } from "vitest";
import { buildExpenseBankInfo, pickPayoutAccount, type BankAccountSource } from "./bank";

function account(overrides: Partial<BankAccountSource>): BankAccountSource {
  return {
    kind: "PRIMARY",
    bankName: null,
    bankCode: null,
    agency: null,
    accountNumber: null,
    accountDigit: null,
    pixKey: null,
    ...overrides,
  };
}

const noDocs = { cnpj: null, cpf: null };

describe("pickPayoutAccount", () => {
  it("prefers PJ, then PRIMARY, then the first account", () => {
    expect(
      pickPayoutAccount([
        { kind: "CLT" },
        { kind: "PRIMARY" },
        { kind: "PJ" },
      ])?.kind,
    ).toBe("PJ");
    expect(
      pickPayoutAccount([{ kind: "CLT" }, { kind: "PRIMARY" }])?.kind,
    ).toBe("PRIMARY");
    expect(pickPayoutAccount([{ kind: "CLT" }])?.kind).toBe("CLT");
    expect(pickPayoutAccount([])).toBeUndefined();
  });
});

describe("buildExpenseBankInfo", () => {
  it("shows the PJ payout account details and joins account number + digit", () => {
    const info = buildExpenseBankInfo(
      [
        account({ kind: "PRIMARY", bankName: "Banco A", pixKey: "primary-pix" }),
        account({
          kind: "PJ",
          bankName: "Banco B",
          agency: "0001",
          accountNumber: "12345",
          accountDigit: "6",
          pixKey: "pj-pix",
        }),
      ],
      { cnpj: "12.345.678/0001-90", cpf: "111.222.333-44" },
    );
    expect(info).toEqual({
      bankName: "Banco B",
      agency: "0001",
      account: "12345-6",
      pixKey: "pj-pix",
      document: "12.345.678/0001-90",
      accountKind: "PJ",
    });
  });

  it("falls back to the payment-rule PIX (PJ→PRIMARY) when the chosen account has none", () => {
    const info = buildExpenseBankInfo(
      [
        account({ kind: "PJ", bankName: "Banco B", pixKey: null }),
        account({ kind: "PRIMARY", pixKey: "primary-pix" }),
      ],
      noDocs,
    );
    // A conta escolhida é a PJ (sem PIX), mas a chave cai para a PRIMARY.
    expect(info?.accountKind).toBe("PJ");
    expect(info?.pixKey).toBe("primary-pix");
  });

  it("uses CPF as the document fallback when there is no CNPJ", () => {
    const info = buildExpenseBankInfo([account({ kind: "PRIMARY" })], {
      cnpj: null,
      cpf: "111.222.333-44",
    });
    expect(info?.document).toBe("111.222.333-44");
  });

  it("returns undefined when there is nothing useful to show", () => {
    expect(buildExpenseBankInfo([], noDocs)).toBeUndefined();
    expect(
      buildExpenseBankInfo([account({ kind: "PRIMARY" })], noDocs),
    ).toBeUndefined();
  });

  it("omits an account number when only the digit is present", () => {
    const info = buildExpenseBankInfo(
      [account({ kind: "PRIMARY", accountDigit: "6", pixKey: "p" })],
      noDocs,
    );
    expect(info?.account).toBeUndefined();
  });
});
