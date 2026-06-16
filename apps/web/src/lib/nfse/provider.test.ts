import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getNfseProvider } from "./provider";
import { isNfseConfigured } from "./config";

/**
 * Provider selection by isNfseConfigured (Fase H). With no credentials the
 * disabled provider must be returned and fail honestly — never a fake emission.
 * The real SaoPauloNfseProvider network pipeline is covered separately with an
 * injected signer + stubbed send (no real network).
 */

const NFSE_ENVS = [
  "NFSE_SP_ENDPOINT",
  "NFSE_PRESTADOR_CNPJ",
  "NFSE_PRESTADOR_IM",
  "NFSE_CERT_PFX_BASE64",
  "NFSE_CERT_PASSWORD",
  "NFSE_AMBIENTE",
] as const;

function clearNfseEnvs() {
  for (const name of NFSE_ENVS) delete process.env[name];
}

beforeEach(() => {
  clearNfseEnvs();
});

afterEach(() => {
  clearNfseEnvs();
});

describe("isNfseConfigured", () => {
  it("is false when no credentials are present", () => {
    expect(isNfseConfigured()).toBe(false);
  });

  it("is false when only some envs are present", () => {
    process.env.NFSE_SP_ENDPOINT = "https://nfe.example/ws";
    process.env.NFSE_PRESTADOR_CNPJ = "12345678000190";
    expect(isNfseConfigured()).toBe(false);
  });

  it("is true only when every credential + endpoint + prestador is set", () => {
    process.env.NFSE_SP_ENDPOINT = "https://nfe.example/ws";
    process.env.NFSE_PRESTADOR_CNPJ = "12345678000190";
    process.env.NFSE_PRESTADOR_IM = "12345678";
    process.env.NFSE_CERT_PFX_BASE64 = "ZmFrZQ==";
    process.env.NFSE_CERT_PASSWORD = "secret";
    expect(isNfseConfigured()).toBe(true);
  });
});

describe("getNfseProvider", () => {
  it("returns the disabled provider that fails honestly when unconfigured", async () => {
    const result = await getNfseProvider().requestIssue({
      fiscalDocumentId: "doc-1",
      revenueClosingId: "closing-1",
      clientId: "client-1",
      amount: 1000,
    });

    expect(result).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });
});
