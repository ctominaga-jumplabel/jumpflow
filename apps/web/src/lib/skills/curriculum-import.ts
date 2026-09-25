/**
 * Leitura assistida de currículo (PDF) por IA — camada de domínio.
 *
 * Governança (docs/agentes.md — Skills Intelligence): a IA SEMPRE apenas PROPÕE.
 * Esta função devolve uma PROPOSTA estruturada (bio, experiências, skills,
 * certificados e cases) para revisão humana; NADA é persistido aqui, NENHUMA
 * skill vira final/validada e NENHUM certificado nasce VALIDATED. O modelo é
 * instruído a NÃO inferir performance ou senioridade e a NÃO expor dados
 * sensíveis de cliente sem necessidade.
 *
 * Retorna `null` quando não há provider configurado ou a leitura falha — o
 * chamador degrada honestamente ("Leitura por IA indisponível").
 */
import { z } from "zod";
import { AI_MODELS, getAiTextProvider } from "@/lib/ai/provider";

export type ProposedSkillLevel =
  | "BASIC"
  | "INTERMEDIATE"
  | "ADVANCED"
  | "SPECIALIST";

export interface ProposedSkill {
  name: string;
  category: string | null;
  level: ProposedSkillLevel;
  /** Trecho curto e neutro do CV que sustenta a skill (evidência). */
  evidence: string | null;
}

export interface ProposedExperience {
  company: string;
  role: string;
  /** YYYY-MM-DD quando o CV traz a data; caso contrário null. */
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  location: string | null;
}

/**
 * Certificação/curso concluído declarado no CV. `issuedAt` é a data de emissão;
 * quando o CV não a traz, vem null e o item NÃO pode ser aplicado sem que o
 * consultor informe a data (Certificate.issuedAt é obrigatório no schema).
 */
export interface ProposedCertificate {
  name: string;
  issuer: string;
  /** YYYY-MM-DD; null quando o CV não declara a data de emissão. */
  issuedAt: string | null;
  expiresAt: string | null;
  credentialId: string | null;
  credentialUrl: string | null;
}

/**
 * Case = entrega CONCLUÍDA digna de referência, extraída do CV. Nasce sempre
 * como candidato (DRAFT_INSIGHT/PENDING) para curadoria humana: o consentimento
 * do cliente para uso comercial NUNCA é inferido de um currículo.
 */
export interface ProposedCase {
  title: string;
  summary: string | null;
  outcome: string | null;
  /** Trecho curto do próprio CV que originou o case (vira `sourceQuote`). */
  evidence: string | null;
}

export interface CurriculumProposal {
  headline: string | null;
  summary: string | null;
  skills: ProposedSkill[];
  experiences: ProposedExperience[];
  certificates: ProposedCertificate[];
  cases: ProposedCase[];
}

const MAX_SKILLS = 40;
const MAX_EXPERIENCES = 25;
const MAX_CERTIFICATES = 30;
const MAX_CASES = 20;

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .catch(null);

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length > 0 ? value : null))
    .nullable()
    .catch(null);

/**
 * URL de credencial proposta pela IA. Só aceita http(s) — qualquer outro
 * esquema (javascript:, data:, file:) vira null, para que a proposta nunca
 * carregue um link perigoso até a tela do consultor.
 */
const credentialUrl = z
  .string()
  .trim()
  .max(500)
  .transform((value) => {
    if (value.length === 0) return null;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:"
        ? value
        : null;
    } catch {
      return null;
    }
  })
  .nullable()
  .catch(null);

const proposalSchema = z.object({
  headline: nullableText(160),
  summary: nullableText(2000),
  skills: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        category: nullableText(80),
        level: z
          .enum(["BASIC", "INTERMEDIATE", "ADVANCED", "SPECIALIST"])
          .catch("INTERMEDIATE"),
        evidence: nullableText(400),
      }),
    )
    .catch([])
    .transform((skills) => skills.slice(0, MAX_SKILLS)),
  experiences: z
    .array(
      z.object({
        company: z.string().trim().min(1).max(160),
        role: z.string().trim().min(1).max(160),
        startDate: isoDate,
        endDate: isoDate,
        description: nullableText(1000),
        location: nullableText(160),
      }),
    )
    .catch([])
    .transform((rows) => rows.slice(0, MAX_EXPERIENCES)),
  certificates: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        issuer: z.string().trim().min(1).max(160),
        issuedAt: isoDate,
        expiresAt: isoDate,
        credentialId: nullableText(120),
        credentialUrl,
      }),
    )
    .catch([])
    .transform((rows) => rows.slice(0, MAX_CERTIFICATES)),
  cases: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        summary: nullableText(1000),
        outcome: nullableText(600),
        evidence: nullableText(400),
      }),
    )
    .catch([])
    .transform((rows) => rows.slice(0, MAX_CASES)),
});

const SYSTEM_PROMPT = [
  "Você extrai dados estruturados de um currículo em PDF para um sistema de gestão de consultores.",
  "Regras obrigatórias:",
  "- Extraia APENAS o que está explícito no documento. Não invente nem complete lacunas.",
  "- NÃO infira performance, potencial ou senioridade da pessoa. O nível de cada skill deve refletir apenas o que o próprio currículo declara (ou, na dúvida, use INTERMEDIATE).",
  "- Na evidência, use um trecho curto e neutro do próprio currículo. NÃO exponha dados sensíveis de clientes (nomes de clientes, valores, dados pessoais de terceiros) a menos que sejam essenciais para descrever a experiência.",
  "- Em certificados, traga somente certificações, cursos e credenciais CONCLUÍDAS que o documento nomeia junto de quem emitiu. Não transforme uma formação acadêmica em certificado.",
  "- Em cases, traga somente entregas CONCLUÍDAS com resultado descrito no próprio currículo. Não trate uma responsabilidade rotineira do cargo como case, e não afirme consentimento do cliente.",
  "- Responda SOMENTE com um objeto JSON válido, sem markdown, sem comentários, sem texto fora do JSON.",
].join("\n");

const USER_PROMPT = [
  "Leia o currículo em anexo e devolva um JSON com exatamente este formato:",
  "{",
  '  "headline": string | null,        // título profissional curto',
  '  "summary": string | null,         // resumo profissional (sem dados financeiros)',
  '  "skills": [ { "name": string, "category": string | null, "level": "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST", "evidence": string | null } ],',
  '  "experiences": [ { "company": string, "role": string, "startDate": "YYYY-MM-DD" | null, "endDate": "YYYY-MM-DD" | null, "description": string | null, "location": string | null } ],',
  '  "certificates": [ { "name": string, "issuer": string, "issuedAt": "YYYY-MM-DD" | null, "expiresAt": "YYYY-MM-DD" | null, "credentialId": string | null, "credentialUrl": string | null } ],',
  '  "cases": [ { "title": string, "summary": string | null, "outcome": string | null, "evidence": string | null } ]',
  "}",
  "Use null quando o dado não existir. Não adicione outras chaves.",
].join("\n");

/**
 * Extrai o texto JSON da resposta do modelo, tolerando cercas de código.
 */
function extractJsonBlock(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : raw).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return candidate.slice(start, end + 1);
}

/**
 * Chama o provider de IA com o PDF (base64) e devolve a PROPOSTA validada, ou
 * `null` quando não há provider ou a leitura/validação falha. Não lança.
 */
export async function extractCurriculumProposal(
  pdfBase64: string,
): Promise<CurriculumProposal | null> {
  const provider = getAiTextProvider();
  const raw = await provider.completeWithDocument(
    USER_PROMPT,
    { mediaType: "application/pdf", dataBase64: pdfBase64 },
    {
      system: SYSTEM_PROMPT,
      model: AI_MODELS.SONNET,
      maxTokens: 8192,
      // Extracao estruturada: o Gemini devolve JSON nativo; o Anthropic segue
      // pelo prompt. `extractJsonBlock` cobre os dois casos.
      json: true,
    },
  );
  if (!raw) return null;

  const jsonText = extractJsonBlock(raw);
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  const result = proposalSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data;
}
