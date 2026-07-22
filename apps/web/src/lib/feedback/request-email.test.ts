import { describe, expect, it } from "vitest";

import { resolveFeedbackRequestEmail } from "./request-email";

describe("resolveFeedbackRequestEmail", () => {
  it("prefere o e-mail explícito sobre o cliente", () => {
    expect(
      resolveFeedbackRequestEmail("ana@cliente.com", {
        billingEmails: ["cobranca@cliente.com"],
        contactEmail: "contato@cliente.com",
      }),
    ).toBe("ana@cliente.com");
  });

  it("cai para o primeiro billingEmail quando não há explícito", () => {
    expect(
      resolveFeedbackRequestEmail("  ", {
        billingEmails: ["", "cobranca@cliente.com", "outro@cliente.com"],
        contactEmail: "contato@cliente.com",
      }),
    ).toBe("cobranca@cliente.com");
  });

  it("cai para contactEmail quando não há billingEmails úteis", () => {
    expect(
      resolveFeedbackRequestEmail(null, {
        billingEmails: [],
        contactEmail: "contato@cliente.com",
      }),
    ).toBe("contato@cliente.com");
  });

  it("retorna null quando nada existe (a action recusa com NO_CONTACT_EMAIL)", () => {
    expect(resolveFeedbackRequestEmail(undefined, null)).toBeNull();
    expect(
      resolveFeedbackRequestEmail(undefined, {
        billingEmails: [""],
        contactEmail: "  ",
      }),
    ).toBeNull();
  });
});
