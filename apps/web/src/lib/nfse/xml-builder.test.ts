import { describe, expect, it } from "vitest";
import { buildRpsXml, deriveRpsReference, escapeXml } from "./xml-builder";

const baseInput = {
  prestador: { cnpj: "12.345.678/0001-90", inscricaoMunicipal: "1.234.567-8" },
  tomador: {
    document: "98.765.432/0001-10",
    name: "Atlas Energia",
    municipality: "Sao Paulo",
    email: "financeiro@atlas.com",
  },
  rps: { serie: "RPS", numero: "42", issuedAt: new Date("2026-06-15T13:00:00Z") },
  lines: [
    { serviceCode: "01015", description: "Projeto Alfa", amount: 2000 },
    { serviceCode: "01015", description: "Projeto Beta", amount: 500 },
  ],
  issRate: 2,
  ambiente: "homologacao" as const,
  versao: "1.00",
};

describe("buildRpsXml", () => {
  it("computes services total and ISS from the lines + rate", () => {
    const result = buildRpsXml(baseInput);
    expect(result.servicesTotal).toBe(2500);
    expect(result.issValue).toBe(50); // 2% of 2500
  });

  it("emits prestador CNPJ/IM digits-only and the homologacao flag", () => {
    const { xml } = buildRpsXml(baseInput);
    expect(xml).toContain("<CNPJ>12345678000190</CNPJ>");
    expect(xml).toContain("<InscricaoPrestador>12345678</InscricaoPrestador>");
    expect(xml).toContain("<Ambiente>H</Ambiente>");
  });

  it("formats money with 2 decimals and ISS aliquota as a fraction", () => {
    const { xml } = buildRpsXml(baseInput);
    expect(xml).toContain("<ValorServicos>2500.00</ValorServicos>");
    expect(xml).toContain("<ValorISS>50.00</ValorISS>");
    expect(xml).toContain("<AliquotaServicos>0.0200</AliquotaServicos>");
  });

  it("uses CNPJ tag for a 14-digit tomador and includes email", () => {
    const { xml } = buildRpsXml(baseInput);
    expect(xml).toContain("<CNPJ>98765432000110</CNPJ>");
    expect(xml).toContain("<EmailTomador>financeiro@atlas.com</EmailTomador>");
  });

  it("uses CPF tag for an 11-digit tomador", () => {
    const { xml } = buildRpsXml({
      ...baseInput,
      tomador: { ...baseInput.tomador, document: "123.456.789-09" },
    });
    expect(xml).toContain("<CPF>12345678909</CPF>");
  });

  it("omits the document block when the tomador has no usable document", () => {
    const { xml } = buildRpsXml({
      ...baseInput,
      tomador: { ...baseInput.tomador, document: "" },
    });
    expect(xml).not.toContain("<CPFCNPJTomador>");
    expect(xml).toContain("<RazaoSocialTomador>Atlas Energia</RazaoSocialTomador>");
  });

  it("marks ISS as retained when requested", () => {
    const { xml } = buildRpsXml({ ...baseInput, issWithheld: true });
    expect(xml).toContain("<ISSRetido>true</ISSRetido>");
  });

  it("is deterministic: same input -> identical XML", () => {
    expect(buildRpsXml(baseInput).xml).toBe(buildRpsXml(baseInput).xml);
  });

  it("escapes XML-significant characters in descriptions", () => {
    const { xml } = buildRpsXml({
      ...baseInput,
      tomador: { ...baseInput.tomador, name: "A & B <Ltda>" },
    });
    expect(xml).toContain("A &amp; B &lt;Ltda&gt;");
  });

  it("emits the production flag for the producao ambiente", () => {
    const { xml } = buildRpsXml({ ...baseInput, ambiente: "producao" });
    expect(xml).toContain("<Ambiente>P</Ambiente>");
  });
});

describe("escapeXml", () => {
  it("escapes the five significant characters", () => {
    expect(escapeXml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });
});

describe("deriveRpsReference", () => {
  it("is deterministic and yields a positive numeric numero", () => {
    const a = deriveRpsReference("fiscal-doc-1");
    const b = deriveRpsReference("fiscal-doc-1");
    expect(a).toEqual(b);
    expect(a.serie).toBe("RPS");
    expect(Number(a.numero)).toBeGreaterThan(0);
  });

  it("differs for different document ids", () => {
    expect(deriveRpsReference("doc-a").numero).not.toBe(
      deriveRpsReference("doc-b").numero,
    );
  });
});
