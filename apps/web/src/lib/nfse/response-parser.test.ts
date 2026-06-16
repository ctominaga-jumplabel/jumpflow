import { describe, expect, it } from "vitest";
import { parseNfseResponse, summarizeNfseErrors } from "./response-parser";

const successXml = `<?xml version="1.0" encoding="UTF-8"?>
<RetornoEnvioRPS xmlns="http://www.prefeitura.sp.gov.br/nfe">
  <Cabecalho versao="1">
    <Sucesso>true</Sucesso>
    <NumeroLote>987654</NumeroLote>
  </Cabecalho>
  <ChaveNFeRPS>
    <ChaveNFe>
      <InscricaoPrestador>12345678</InscricaoPrestador>
      <NumeroNFe>00012345</NumeroNFe>
      <CodigoVerificacao>ABC12DEF</CodigoVerificacao>
    </ChaveNFe>
  </ChaveNFeRPS>
</RetornoEnvioRPS>`;

const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<RetornoEnvioRPS xmlns="http://www.prefeitura.sp.gov.br/nfe">
  <Cabecalho versao="1">
    <Sucesso>false</Sucesso>
  </Cabecalho>
  <Erro>
    <Codigo>205</Codigo>
    <Descricao>Inscricao Municipal do prestador invalida</Descricao>
  </Erro>
</RetornoEnvioRPS>`;

const namespacedXml = `<env:Envelope xmlns:env="x">
  <env:Body>
    <ns2:RetornoEnvioRPS>
      <ns2:Sucesso>true</ns2:Sucesso>
      <ns2:ChaveNFe>
        <ns2:NumeroNFe>55</ns2:NumeroNFe>
        <ns2:CodigoVerificacao>ZZ99</ns2:CodigoVerificacao>
      </ns2:ChaveNFe>
    </ns2:RetornoEnvioRPS>
  </env:Body>
</env:Envelope>`;

describe("parseNfseResponse", () => {
  it("extracts invoice number, verification code and protocol on success", () => {
    const result = parseNfseResponse(successXml);
    expect(result.success).toBe(true);
    expect(result.invoiceNumber).toBe("00012345");
    expect(result.verificationCode).toBe("ABC12DEF");
    expect(result.protocol).toBe("987654");
    expect(result.errors).toHaveLength(0);
  });

  it("captures error code + description and reports failure", () => {
    const result = parseNfseResponse(errorXml);
    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      code: "205",
      message: "Inscricao Municipal do prestador invalida",
    });
  });

  it("reads tags regardless of namespace prefixes", () => {
    const result = parseNfseResponse(namespacedXml);
    expect(result.success).toBe(true);
    expect(result.invoiceNumber).toBe("55");
    expect(result.verificationCode).toBe("ZZ99");
  });

  it("treats empty/garbage XML as a failure without throwing", () => {
    expect(parseNfseResponse("").success).toBe(false);
    expect(parseNfseResponse("not xml at all").success).toBe(false);
    // @ts-expect-error intentionally passing a non-string
    expect(parseNfseResponse(null).success).toBe(false);
  });

  it("fails when a number is present but an error block also exists", () => {
    const mixed = `<R><NumeroNFe>1</NumeroNFe><Erro><Codigo>9</Codigo><Descricao>x</Descricao></Erro></R>`;
    expect(parseNfseResponse(mixed).success).toBe(false);
  });
});

describe("summarizeNfseErrors", () => {
  it("joins coded errors", () => {
    expect(
      summarizeNfseErrors([{ code: "205", message: "invalida" }]),
    ).toBe("[205] invalida");
  });

  it("falls back to a generic message when there are no errors", () => {
    expect(summarizeNfseErrors([])).toContain("sem numero");
  });
});
