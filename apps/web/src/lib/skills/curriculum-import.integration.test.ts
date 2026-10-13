import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractCurriculumProposal } from "./curriculum-import";
import {
  buildCurriculumPdf,
  SAMPLE_CURRICULUM_LINES,
} from "./__fixtures__/curriculum-pdf";

/**
 * Teste de INTEGRAÇÃO da leitura de currículo: chama a API do Gemini DE VERDADE
 * com um PDF de currículo real e confere que a proposta vem preenchida em
 * skills, certificados e cases.
 *
 * Roda apenas quando há credencial (`GOOGLE_API_KEY` ou `GEMINI_API_KEY`) no
 * ambiente — sem ela o bloco inteiro é pulado, para `npm test` continuar verde
 * em CI e na máquina de quem não tem chave. Para rodar:
 *
 *   GOOGLE_API_KEY=... npx vitest run src/lib/skills/curriculum-import.integration.test.ts --root apps/web
 *
 * ATENÇÃO: consome cota da API (uma chamada por execução).
 *
 * As asserções são deliberadamente FROUXAS — LLM não é determinístico. O que
 * garantimos é o contrato: as três listas vêm preenchidas, os campos
 * obrigatórios existem e as datas saem no formato que o apply exige. Não
 * cravamos texto exato, que mudaria a cada versão de modelo.
 */

const hasKey = Boolean(
  process.env.GOOGLE_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim(),
);

describe.skipIf(!hasKey)("extractCurriculumProposal — Gemini real", () => {
  beforeEach(() => {
    vi.stubEnv("AI_PROVIDER", "gemini");
  });

  it(
    "lê um currículo em PDF e propõe skills, certificados e cases",
    async () => {
      const pdf = buildCurriculumPdf(SAMPLE_CURRICULUM_LINES);
      const proposal = await extractCurriculumProposal(
        pdf.toString("base64"),
      );

      expect(proposal, "o provider devolveu null — veja o log do fetch").not.toBeNull();
      if (!proposal) return;

      // Skills: o CV lista Python/SQL/Airflow/dbt/AWS/Terraform.
      expect(proposal.skills.length).toBeGreaterThan(0);
      const skillNames = proposal.skills.map((s) => s.name.toLowerCase());
      expect(skillNames.some((name) => name.includes("python"))).toBe(true);

      // Certificados: o CV nomeia dois, com emissor e data.
      expect(proposal.certificates.length).toBeGreaterThan(0);
      const cert = proposal.certificates[0];
      expect(cert.name.length).toBeGreaterThan(0);
      expect(cert.issuer.length).toBeGreaterThan(0);
      // Quando vier data, tem de estar no formato que o apply aceita.
      for (const row of proposal.certificates) {
        if (row.issuedAt) expect(row.issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        if (row.expiresAt) expect(row.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }

      // Cases: o CV traz duas entregas concluídas com resultado.
      expect(proposal.cases.length).toBeGreaterThan(0);
      expect(proposal.cases[0].title.length).toBeGreaterThan(0);

      // Experiências e bio completam a proposta.
      expect(proposal.experiences.length).toBeGreaterThan(0);
      expect(proposal.headline ?? proposal.summary).toBeTruthy();

      // Visibilidade do que o modelo devolveu, para depurar sem repetir a chamada.
      console.info(
        "[integration] proposta:",
        JSON.stringify(
          {
            headline: proposal.headline,
            skills: proposal.skills.map((s) => s.name),
            certificates: proposal.certificates.map((c) => ({
              name: c.name,
              issuer: c.issuer,
              issuedAt: c.issuedAt,
            })),
            cases: proposal.cases.map((c) => c.title),
          },
          null,
          2,
        ),
      );
    },
    120_000,
  );
});
