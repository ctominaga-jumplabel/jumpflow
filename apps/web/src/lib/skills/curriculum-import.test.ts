import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Extração assistida de currículo — camada de domínio.
 *
 * Prova que a PROPOSTA carrega também certificados e cases (além de bio,
 * experiências e skills), e que o parsing é defensivo: resposta fora do
 * contrato nunca vira proposta parcialmente inventada, e um link de credencial
 * com esquema perigoso nunca chega à tela do consultor.
 */

const h = vi.hoisted(() => ({ raw: null as string | null }));

vi.mock("@/lib/ai/provider", () => ({
  AI_MODELS: {
    OPUS: "claude-opus-5",
    SONNET: "claude-sonnet-5",
    HAIKU: "claude-haiku-4-5",
  },
  getAiTextProvider: () => ({
    complete: async () => h.raw,
    completeWithDocument: async () => h.raw,
  }),
}));

import { extractCurriculumProposal } from "./curriculum-import";

const FULL = {
  headline: "Engenheira de dados",
  summary: "Resumo profissional.",
  skills: [
    {
      name: "Python",
      category: "Dados",
      level: "ADVANCED",
      evidence: "Pipelines em Python",
    },
  ],
  experiences: [
    {
      company: "Jump",
      role: "Consultora",
      startDate: "2024-01-01",
      endDate: null,
      description: null,
      location: "Sao Paulo",
    },
  ],
  certificates: [
    {
      name: "AWS Solutions Architect",
      issuer: "Amazon Web Services",
      issuedAt: "2025-03-10",
      expiresAt: "2028-03-10",
      credentialId: "ABC-123",
      credentialUrl: "https://verify.example.com/abc",
    },
  ],
  cases: [
    {
      title: "Migracao de data warehouse",
      summary: "Migrou o DW para arquitetura em nuvem.",
      outcome: "Custo mensal reduzido.",
      evidence: "Liderou a migracao do DW",
    },
  ],
};

beforeEach(() => {
  h.raw = JSON.stringify(FULL);
});

describe("extractCurriculumProposal — certificados e cases", () => {
  it("extrai certificados com emissor, datas e credencial", async () => {
    const proposal = await extractCurriculumProposal("Zm9v");
    expect(proposal).not.toBeNull();
    expect(proposal!.certificates).toEqual([
      {
        name: "AWS Solutions Architect",
        issuer: "Amazon Web Services",
        issuedAt: "2025-03-10",
        expiresAt: "2028-03-10",
        credentialId: "ABC-123",
        credentialUrl: "https://verify.example.com/abc",
      },
    ]);
  });

  it("extrai cases com resumo, resultado e evidencia", async () => {
    const proposal = await extractCurriculumProposal("Zm9v");
    expect(proposal!.cases).toEqual([
      {
        title: "Migracao de data warehouse",
        summary: "Migrou o DW para arquitetura em nuvem.",
        outcome: "Custo mensal reduzido.",
        evidence: "Liderou a migracao do DW",
      },
    ]);
  });

  it("aceita certificado sem data de emissao, marcando issuedAt como null", async () => {
    h.raw = JSON.stringify({
      ...FULL,
      certificates: [
        {
          name: "Scrum Master",
          issuer: "Scrum Alliance",
          issuedAt: "2023",
          expiresAt: null,
          credentialId: null,
          credentialUrl: null,
        },
      ],
    });
    const proposal = await extractCurriculumProposal("Zm9v");
    // "2023" nao e YYYY-MM-DD: vira null e o item so pode ser aplicado depois
    // que o consultor informar a data (Certificate.issuedAt e obrigatorio).
    expect(proposal!.certificates[0].issuedAt).toBeNull();
    expect(proposal!.certificates[0].name).toBe("Scrum Master");
  });

  it("descarta credentialUrl com esquema perigoso", async () => {
    h.raw = JSON.stringify({
      ...FULL,
      certificates: [
        {
          ...FULL.certificates[0],
          credentialUrl: "javascript:alert(1)",
        },
      ],
    });
    const proposal = await extractCurriculumProposal("Zm9v");
    expect(proposal!.certificates[0].credentialUrl).toBeNull();
  });

  it("devolve listas vazias quando o modelo omite certificados e cases", async () => {
    h.raw = JSON.stringify({
      headline: null,
      summary: null,
      skills: [],
      experiences: [],
    });
    const proposal = await extractCurriculumProposal("Zm9v");
    expect(proposal!.certificates).toEqual([]);
    expect(proposal!.cases).toEqual([]);
  });

  it("limita a quantidade de certificados e cases", async () => {
    h.raw = JSON.stringify({
      ...FULL,
      certificates: Array.from({ length: 40 }, (_, i) => ({
        name: `Cert ${i}`,
        issuer: "Emissor",
        issuedAt: "2025-01-01",
        expiresAt: null,
        credentialId: null,
        credentialUrl: null,
      })),
      cases: Array.from({ length: 40 }, (_, i) => ({
        title: `Case ${i}`,
        summary: null,
        outcome: null,
        evidence: null,
      })),
    });
    const proposal = await extractCurriculumProposal("Zm9v");
    expect(proposal!.certificates).toHaveLength(30);
    expect(proposal!.cases).toHaveLength(20);
  });

  it("tolera a resposta vir dentro de cerca de codigo markdown", async () => {
    h.raw = "```json\n" + JSON.stringify(FULL) + "\n```";
    const proposal = await extractCurriculumProposal("Zm9v");
    expect(proposal!.certificates).toHaveLength(1);
    expect(proposal!.cases).toHaveLength(1);
  });

  it("devolve null quando a resposta nao e JSON", async () => {
    h.raw = "Nao consegui ler o arquivo.";
    expect(await extractCurriculumProposal("Zm9v")).toBeNull();
  });

  it("devolve null quando nao ha provider (resposta vazia)", async () => {
    h.raw = null;
    expect(await extractCurriculumProposal("Zm9v")).toBeNull();
  });
});
