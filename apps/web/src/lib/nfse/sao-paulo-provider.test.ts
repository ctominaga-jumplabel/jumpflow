import { afterEach, describe, expect, it } from "vitest";
import { SaoPauloNfseProvider, wrapSoapEnvelope } from "./sao-paulo-provider";
import { resetNfseSigner, setNfseSigner } from "./signing";
import type { NfseRuntimeConfig } from "./config";

/**
 * SaoPauloNfseProvider pipeline tests — fully OFFLINE. The A1 signer is injected
 * (no real certificate) and the SOAP send is stubbed (no real network).
 */

const config: NfseRuntimeConfig = {
  endpoint: "https://nfe.test/ws",
  ambiente: "homologacao",
  versao: "1.00",
  prestador: { cnpj: "12345678000190", inscricaoMunicipal: "12345678" },
  certificate: { pfxBase64: "ZmFrZQ==", password: "secret" },
};

/** Subclass to stub the protected SOAP send without touching the network. */
class StubbedProvider extends SaoPauloNfseProvider {
  constructor(
    cfg: NfseRuntimeConfig,
    private readonly responder: (xml: string) => string | Promise<string>,
  ) {
    super(cfg);
  }
  protected async send(signedXml: string): Promise<string> {
    return this.responder(signedXml);
  }
}

const SUCCESS_RESPONSE = `<RetornoEnvioRPS>
  <Sucesso>true</Sucesso>
  <NumeroLote>555</NumeroLote>
  <ChaveNFe><NumeroNFe>00099</NumeroNFe><CodigoVerificacao>VC1</CodigoVerificacao></ChaveNFe>
</RetornoEnvioRPS>`;

const ERROR_RESPONSE = `<RetornoEnvioRPS><Sucesso>false</Sucesso>
  <Erro><Codigo>205</Codigo><Descricao>IM invalida</Descricao></Erro></RetornoEnvioRPS>`;

const issueInput = {
  fiscalDocumentId: "doc-1",
  revenueClosingId: "rc-1",
  clientId: "cli-1",
  amount: 2500,
  issRate: 2,
  tomador: {
    document: "98765432000110",
    name: "Atlas Energia",
    municipality: "Sao Paulo",
    email: "fin@atlas.com",
  },
  lines: [
    { description: "Projeto Alfa", amount: 2000 },
    { description: "Projeto Beta", amount: 500 },
  ],
};

afterEach(() => {
  resetNfseSigner();
});

describe("SaoPauloNfseProvider", () => {
  it("degrades honestly when no real signer is registered (no send)", async () => {
    resetNfseSigner();
    let sendCalled = false;
    const provider = new StubbedProvider(config, () => {
      sendCalled = true;
      return SUCCESS_RESPONSE;
    });
    const result = await provider.requestIssue(issueInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Assinatura digital A1/);
    expect(sendCalled).toBe(false);
  });

  it("builds, signs, sends and parses a successful issuance", async () => {
    let signedSeen = "";
    setNfseSigner({
      async sign({ xml }) {
        signedSeen = xml;
        return { ok: true, xml: `${xml}<!--signed-->` };
      },
    });
    let sentXml = "";
    const provider = new StubbedProvider(config, (xml) => {
      sentXml = xml;
      return SUCCESS_RESPONSE;
    });

    const result = await provider.requestIssue(issueInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.invoiceNumber).toBe("00099");
      expect(result.data.verificationCode).toBe("VC1");
      expect(result.data.protocol).toBe("555");
      expect(result.data.requestXml).toContain("<!--signed-->");
      expect(result.data.responseXml).toContain("NumeroNFe");
    }
    // The RPS that was signed carries the prestador + computed totals.
    expect(signedSeen).toContain("<ValorServicos>2500.00</ValorServicos>");
    expect(signedSeen).toContain("<CNPJ>12345678000190</CNPJ>");
    // The signed XML reached the SOAP send.
    expect(sentXml).toContain("<!--signed-->");
  });

  it("returns a failure carrying parsed provider errors", async () => {
    setNfseSigner({ async sign({ xml }) { return { ok: true, xml }; } });
    const provider = new StubbedProvider(config, () => ERROR_RESPONSE);
    const result = await provider.requestIssue(issueInput);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("IM invalida");
  });

  it("returns a safe failure when the transport throws (no creds leak)", async () => {
    setNfseSigner({ async sign({ xml }) { return { ok: true, xml }; } });
    const provider = new StubbedProvider(config, () => {
      throw new Error("HTTP 500");
    });
    const result = await provider.requestIssue(issueInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain("HTTP 500");
      expect(result.message).not.toContain("secret");
      expect(result.message).not.toContain("ZmFrZQ==");
    }
  });
});

describe("wrapSoapEnvelope", () => {
  it("escapes the RPS payload into the MensagemXML element", () => {
    const env = wrapSoapEnvelope("<RPS><a>1</a></RPS>");
    expect(env).toContain("<nfe:MensagemXML>&lt;RPS&gt;");
    expect(env).toContain("soap:Envelope");
  });
});
