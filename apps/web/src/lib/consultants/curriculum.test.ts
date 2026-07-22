import { describe, expect, it } from "vitest";
import {
  assembleCurriculum,
  type ConsultantCurriculum,
  type CurriculumSourceData,
} from "./curriculum";
import { curriculumBioSchema } from "./schemas";

const GENERATED_AT = new Date("2026-07-03T12:00:00.000Z");

function makeSource(
  overrides: Partial<CurriculumSourceData> = {},
): CurriculumSourceData {
  return {
    consultant: {
      id: "con-1",
      name: "Ana Martins",
      jobTitle: "Engenheira de Dados",
      seniority: "SENIOR",
      area: "Dados",
      curriculumHeadline: "Foco em analytics",
      curriculumSummary: "Resumo profissional.",
    },
    educations: [
      {
        institution: "USP",
        course: "Ciencia da Computacao",
        degree: "UNDERGRADUATE",
        startYear: 2012,
        endYear: 2016,
        completed: true,
      },
    ],
    languages: [{ name: "Ingles", level: "ADVANCED" }],
    skills: [
      {
        name: "SQL",
        category: "Dados",
        level: "ADVANCED",
        yearsExperience: 5,
      },
    ],
    certificates: [
      {
        name: "AWS Data Analytics",
        issuer: "AWS",
        issuedAt: new Date("2023-05-10T00:00:00.000Z"),
        expiresAt: new Date("2026-05-10T00:00:00.000Z"),
        credentialUrl: "https://example.com/cred",
      },
    ],
    experiences: [
      {
        company: "Empresa Antiga",
        role: "Analista",
        startDate: new Date("2016-02-01T00:00:00.000Z"),
        endDate: new Date("2019-12-31T00:00:00.000Z"),
        description: "Analise de dados e relatorios.",
        location: "Sao Paulo",
      },
      {
        company: "Empresa Atual",
        role: "Engenheira de Dados",
        startDate: new Date("2020-01-01T00:00:00.000Z"),
        endDate: null,
        description: null,
        location: null,
      },
    ],
    allocations: [
      {
        projectName: "Projeto Alpha",
        clientName: "Cliente X",
        role: "Tech Lead",
        startDate: new Date("2024-01-01T00:00:00.000Z"),
        endDate: null,
      },
    ],
    highlights: { developmentPlansActive: 2, evaluationsCompleted: 3 },
    ...overrides,
  };
}

describe("assembleCurriculum", () => {
  it("monta as secoes a partir das fontes", () => {
    const cv = assembleCurriculum(makeSource(), GENERATED_AT);

    expect(cv.consultantId).toBe("con-1");
    expect(cv.identity.name).toBe("Ana Martins");
    expect(cv.identity.seniority).toBe("Senior");
    expect(cv.identity.headline).toBe("Foco em analytics");
    expect(cv.education).toHaveLength(1);
    expect(cv.education[0].degree).toBe("Graduacao");
    expect(cv.education[0].period).toBe("2012 - 2016");
    expect(cv.languages[0].level).toBe("Avancado");
    expect(cv.skills[0].level).toBe("Avançado");
    expect(cv.certificates[0].issuedAt).toBe("2023-05-10");
    expect(cv.certificates[0].expiresAt).toBe("2026-05-10");
    expect(cv.projects[0].role).toBe("Tech Lead");
    expect(cv.projects[0].period).toBe("2024-01-01 - atual");
    // Experiencia declarada (P27): a ATUAL (sem endDate) vem primeiro, depois a
    // anterior por inicio decrescente.
    expect(cv.professionalExperience).toHaveLength(2);
    expect(cv.professionalExperience[0].company).toBe("Empresa Atual");
    expect(cv.professionalExperience[0].current).toBe(true);
    expect(cv.professionalExperience[0].period).toBe("2020-01-01 - atual");
    expect(cv.professionalExperience[1].company).toBe("Empresa Antiga");
    expect(cv.professionalExperience[1].current).toBe(false);
    expect(cv.professionalExperience[1].period).toBe("2016-02-01 - 2019-12-31");
    expect(cv.highlights).toEqual([
      { label: "Planos de desenvolvimento ativos", value: "2" },
      { label: "Avaliacoes concluidas", value: "3" },
    ]);
    expect(cv.generatedAt).toBe(GENERATED_AT.toISOString());
  });

  it("trata secoes vazias com elegancia", () => {
    const cv = assembleCurriculum(
      makeSource({
        educations: [],
        languages: [],
        skills: [],
        certificates: [],
        experiences: [],
        allocations: [],
        highlights: { developmentPlansActive: 0, evaluationsCompleted: 0 },
      }),
      GENERATED_AT,
    );
    expect(cv.education).toEqual([]);
    expect(cv.languages).toEqual([]);
    expect(cv.skills).toEqual([]);
    expect(cv.certificates).toEqual([]);
    expect(cv.professionalExperience).toEqual([]);
    expect(cv.projects).toEqual([]);
    expect(cv.highlights).toEqual([]);
  });

  it("NUNCA expoe campos financeiros no agregado", () => {
    const cv = assembleCurriculum(makeSource(), GENERATED_AT);
    // Coleta todas as chaves e strings do agregado, recursivamente.
    const tokens: string[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === "object") {
        for (const [key, inner] of Object.entries(value)) {
          tokens.push(key.toLowerCase());
          walk(inner);
        }
      } else if (typeof value === "string") {
        tokens.push(value.toLowerCase());
      }
    };
    walk(cv);
    const haystack = tokens.join(" ");
    // Termos financeiros como palavras (word-boundary) para evitar falsos
    // positivos como "generatedAt".
    const forbidden = [
      "hourlycost",
      "hourlyrate",
      "compensation",
      "salary",
      "salario",
      "remuneracao",
      "benefit",
      "beneficio",
      "cltamount",
      "pjamount",
      "amount",
      "valor",
      "custo",
      "cost",
      "rate",
      "brl",
    ];
    for (const term of forbidden) {
      const pattern = new RegExp(`\\b${term}\\b`);
      expect(haystack, `termo financeiro proibido: ${term}`).not.toMatch(
        pattern,
      );
    }

    // Guarda estrutural: as chaves de topo sao apenas as secoes esperadas.
    const topKeys = Object.keys(cv).sort();
    expect(topKeys).toEqual(
      (
        [
          "certificates",
          "consultantId",
          "education",
          "generatedAt",
          "highlights",
          "identity",
          "languages",
          "professionalExperience",
          "projects",
          "skills",
        ] satisfies (keyof ConsultantCurriculum)[]
      ).sort(),
    );
  });
});

describe("curriculumBioSchema", () => {
  it("aceita bio valida e normaliza vazio para undefined", () => {
    const parsed = curriculumBioSchema.parse({
      consultantId: "con-1",
      headline: "  Engenheira  ",
      summary: "",
    });
    expect(parsed.headline).toBe("Engenheira");
    expect(parsed.summary).toBeUndefined();
  });

  it("rejeita headline acima do limite", () => {
    const result = curriculumBioSchema.safeParse({
      consultantId: "con-1",
      headline: "a".repeat(161),
    });
    expect(result.success).toBe(false);
  });

  it("rejeita consultantId invalido", () => {
    const result = curriculumBioSchema.safeParse({
      consultantId: "",
      headline: "ok",
    });
    expect(result.success).toBe(false);
  });
});
