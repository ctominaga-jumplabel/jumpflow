import { z } from "zod";
import { AI_MODELS, type AiModel } from "@/lib/ai/provider";

/**
 * Checkpoint Intelligence — pipeline de IA (Melhoria #4, FATIA 4).
 *
 * Este módulo é PURO (sem I/O, sem server-only): define o contrato da SAÍDA da
 * IA, monta o prompt/system com guardrails LGPD, faz o parse defensivo do
 * retorno (string→JSON) e MAPEIA a saída validada para os inputs de criação das
 * 3 trilhas (Skills via SkillSuggestion existente, Opportunity e Case).
 *
 * Governança (CLAUDE.md / p3-inteligencia-design.md):
 * - A IA LÊ apenas o corpo fornecido (notes/transcription); NÃO inventa pessoa,
 *   cliente, número ou data.
 * - A IA SUGERE; o humano decide. Tudo nasce status PENDING.
 * - Skills NÃO ganham modelo novo: mapeiam para `SkillSuggestion` (curadoria
 *   continua na tela de Skills existente). Opportunity/Case são INTERNOS (sem CRM).
 *
 * A action `extractCheckpointInsights` (server) chama `buildExtractionPrompt` +
 * `getAiTextProvider().complete(...)`, depois `parseExtraction(...)` e, em
 * sucesso, `mapExtraction(...)`. Fallback seguro: provider noop → null → NONE.
 */

// ── Modelo recomendado ────────────────────────────────────────────────────────

/**
 * Extração estruturada curta: HAIKU é suficiente e barato. A action pode trocar,
 * mas este é o default recomendado pela governança de custo.
 */
export const CHECKPOINT_EXTRACTION_MODEL: AiModel = AI_MODELS.HAIKU;

// ── Schema da SAÍDA da IA ──────────────────────────────────────────────────────

/**
 * Trecho-fonte (quote): curto por design (guardrail LGPD — não copiar a conversa
 * inteira). Truncamos defensivamente no parser caso a IA exceda.
 */
export const QUOTE_MAX_CHARS = 280;

const aiSkill = z.object({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(80).optional(),
  /** Texto livre da IA; normalizado para SkillLevel em mapExtraction. */
  level: z.string().trim().max(40).optional(),
  quote: z.string().trim().max(QUOTE_MAX_CHARS).optional(),
});

const aiOpportunity = z.object({
  /** Texto livre da IA; normalizado para OpportunityKind em mapExtraction. */
  kind: z.string().trim().max(40).optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  /** Texto livre da IA; normalizado para OpportunityPriority em mapExtraction. */
  priority: z.string().trim().max(40).optional(),
  /** Pista de cliente em texto livre — NÃO vira FK (handoff manual, sem CRM). */
  clientHint: z.string().trim().max(200).optional(),
  quote: z.string().trim().max(QUOTE_MAX_CHARS).optional(),
});

const aiCase = z.object({
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().max(2000).optional(),
  outcome: z.string().trim().max(2000).optional(),
  quote: z.string().trim().max(QUOTE_MAX_CHARS).optional(),
});

/** Schema da saída esperada da IA. Tolerante a trilhas vazias/ausentes. */
export const extractionOutputSchema = z.object({
  skills: z.array(aiSkill).max(50).default([]),
  opportunities: z.array(aiOpportunity).max(50).default([]),
  cases: z.array(aiCase).max(50).default([]),
});

export type ExtractionOutput = z.infer<typeof extractionOutputSchema>;
export type AiSkill = z.infer<typeof aiSkill>;
export type AiOpportunity = z.infer<typeof aiOpportunity>;
export type AiCase = z.infer<typeof aiCase>;

// ── Prompt + system (guardrails) ───────────────────────────────────────────────

export const EXTRACTION_SYSTEM_PROMPT = [
  "Você é um analista de pessoas e operações da Jump.",
  "Sua tarefa é extrair insights ESTRUTURADOS do registro de um checkpoint/1-on-1.",
  "",
  "REGRAS OBRIGATÓRIAS (LGPD / confiança):",
  "- Extraia SOMENTE informações presentes no texto fornecido. NÃO invente nada.",
  "- NÃO infira nem gere dados pessoais, nomes de clientes, valores, datas ou contatos que não estejam escritos.",
  "- Cada item DEVE ter um campo `quote`: um trecho CURTO (até 280 caracteres) e literal do texto que justifica o item.",
  "- Se o texto não contiver evidência para uma trilha, retorne uma lista vazia para ela.",
  "- Não produza opinião, diagnóstico médico, nem juízo sobre a pessoa.",
  "",
  "TRILHAS:",
  "- skills: competências técnicas/comportamentais demonstradas pelo consultor. level pode ser básico|intermediário|avançado|especialista.",
  "- opportunities: chances FUTURAS de negócio internas. kind pode ser expansion|upsell|risk|referral|renewal. priority pode ser low|medium|high.",
  "- cases: entregas CONCLUÍDAS dignas de referência (não algo a fazer no futuro).",
  "",
  "SAÍDA: responda APENAS com um objeto JSON válido, sem markdown, sem comentários, no formato:",
  '{"skills":[{"name":"","category":"","level":"","quote":""}],"opportunities":[{"kind":"","title":"","description":"","priority":"","clientHint":"","quote":""}],"cases":[{"title":"","summary":"","outcome":"","quote":""}]}',
].join("\n");

export interface ExtractionPromptInput {
  /** Corpo do checkpoint a analisar: transcrição (preferida) e/ou notas. */
  transcription?: string | null;
  notes?: string | null;
  /** Metadados não sensíveis para orientar a extração (sem dados de pessoa). */
  type?: "ONE_ON_ONE" | "CHECKPOINT";
  relatedProjectName?: string | null;
}

/**
 * Corpo efetivo a analisar: transcrição tem prioridade; notas complementam.
 * Retorna string vazia quando não há nada (a action deve curto-circuitar).
 */
export function resolveExtractionBody(input: ExtractionPromptInput): string {
  const parts: string[] = [];
  if (input.transcription && input.transcription.trim()) {
    parts.push(`Transcrição:\n${input.transcription.trim()}`);
  }
  if (input.notes && input.notes.trim()) {
    parts.push(`Notas do gestor:\n${input.notes.trim()}`);
  }
  return parts.join("\n\n");
}

/** Monta o prompt do usuário (o system vai em opts.system na chamada). */
export function buildExtractionPrompt(input: ExtractionPromptInput): string {
  const body = resolveExtractionBody(input);
  const header: string[] = [];
  if (input.type) {
    header.push(
      `Tipo de registro: ${input.type === "ONE_ON_ONE" ? "1-on-1" : "Checkpoint"}.`,
    );
  }
  if (input.relatedProjectName) {
    header.push(`Projeto relacionado: ${input.relatedProjectName}.`);
  }
  return [
    ...header,
    "Extraia as trilhas (skills, opportunities, cases) do texto abaixo e responda APENAS o JSON.",
    "",
    "=== TEXTO DO CHECKPOINT ===",
    body,
    "=== FIM DO TEXTO ===",
  ].join("\n");
}

// ── Parser defensivo ────────────────────────────────────────────────────────────

export type ParseResult =
  | { ok: true; data: ExtractionOutput }
  | { ok: false; reason: string };

/**
 * Remove cercas de código markdown (```json ... ```) que alguns modelos colocam
 * mesmo instruídos a não fazê-lo, e isola o primeiro objeto JSON do texto.
 */
function stripToJson(raw: string): string {
  let s = raw.trim();
  // Remove fences ```json / ``` de início/fim.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  // Isola do primeiro `{` ao último `}` (tolera prosa ao redor).
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s;
}

/**
 * Parse defensivo string→JSON→Zod. NUNCA lança: retorna `{ ok:false }` em
 * qualquer falha (JSON inválido, schema inválido, entrada vazia), para a action
 * marcar o checkpoint como FAILED com fallback seguro.
 */
export function parseExtraction(raw: string | null | undefined): ParseResult {
  if (raw === null || raw === undefined || raw.trim() === "") {
    return { ok: false, reason: "empty_response" };
  }
  let json: unknown;
  try {
    json = JSON.parse(stripToJson(raw));
  } catch {
    return { ok: false, reason: "invalid_json" };
  }
  const result = extractionOutputSchema.safeParse(json);
  if (!result.success) {
    return { ok: false, reason: "schema_mismatch" };
  }
  return { ok: true, data: result.data };
}

// ── Normalização para enums ─────────────────────────────────────────────────────

export type SkillLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST";
export type OpportunityKind =
  | "EXPANSION"
  | "UPSELL"
  | "RISK"
  | "REFERRAL"
  | "RENEWAL";
export type OpportunityPriority = "LOW" | "MEDIUM" | "HIGH";

/** Default seguro quando a IA não informa (ou informa algo desconhecido). */
export const DEFAULT_SKILL_LEVEL: SkillLevel = "INTERMEDIATE";
export const DEFAULT_OPPORTUNITY_KIND: OpportunityKind = "EXPANSION";
export const DEFAULT_OPPORTUNITY_PRIORITY: OpportunityPriority = "MEDIUM";

function norm(value: string | undefined | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    // remove diacríticos (combining marks U+0300–U+036F)
    .replace(/[̀-ͯ]/g, "");
}

export function normalizeSkillLevel(value: string | undefined): SkillLevel {
  switch (norm(value)) {
    case "basic":
    case "basico":
    case "iniciante":
    case "beginner":
      return "BASIC";
    case "intermediate":
    case "intermediario":
    case "medio":
      return "INTERMEDIATE";
    case "advanced":
    case "avancado":
    case "senior":
      return "ADVANCED";
    case "specialist":
    case "especialista":
    case "expert":
      return "SPECIALIST";
    default:
      return DEFAULT_SKILL_LEVEL;
  }
}

export function normalizeOpportunityKind(
  value: string | undefined,
): OpportunityKind {
  switch (norm(value)) {
    case "expansion":
    case "expansao":
      return "EXPANSION";
    case "upsell":
    case "up-sell":
    case "crosssell":
    case "cross-sell":
      return "UPSELL";
    case "risk":
    case "risco":
    case "churn":
      return "RISK";
    case "referral":
    case "indicacao":
    case "referencia":
      return "REFERRAL";
    case "renewal":
    case "renovacao":
      return "RENEWAL";
    default:
      return DEFAULT_OPPORTUNITY_KIND;
  }
}

export function normalizeOpportunityPriority(
  value: string | undefined,
): OpportunityPriority {
  switch (norm(value)) {
    case "low":
    case "baixa":
    case "baixo":
      return "LOW";
    case "medium":
    case "media":
    case "medio":
      return "MEDIUM";
    case "high":
    case "alta":
    case "alto":
    case "critical":
    case "critica":
      return "HIGH";
    default:
      return DEFAULT_OPPORTUNITY_PRIORITY;
  }
}

// ── Mapeamento para inputs de criação ───────────────────────────────────────────

/**
 * Contexto persistido do checkpoint, necessário para ancorar os candidatos.
 * A janela semanal (weekStart/weekEnd) é OBRIGATÓRIA para SkillSuggestion (o
 * model não aceita null); a action garante um fallback antes de chamar isto.
 */
export interface CheckpointExtractionContext {
  checkpointId: string;
  consultantId: string;
  weekStart: Date;
  weekEnd: Date;
  relatedProjectId?: string | null;
}

/** Input idempotente para upsert de SkillSuggestion (espelha a tela de Skills). */
export interface SkillSuggestionInput {
  consultantId: string;
  weekStart: Date;
  weekEnd: Date;
  suggestedName: string;
  suggestedCategory: string | null;
  suggestedLevel: SkillLevel;
  evidenceSummary: string | null;
  sourceEntryIds: string[];
}

/** Input de criação de Opportunity (nasce PENDING + aiGenerated). */
export interface OpportunityInput {
  sourceCheckpointId: string;
  consultantId: string;
  relatedProjectId: string | null;
  kind: OpportunityKind;
  title: string;
  description: string | null;
  priority: OpportunityPriority;
  sourceQuote: string | null;
}

/** Input de criação de Case (nasce PENDING + aiGenerated). */
export interface CaseInput {
  sourceCheckpointId: string;
  consultantId: string;
  relatedProjectId: string | null;
  title: string;
  summary: string | null;
  outcome: string | null;
  sourceQuote: string | null;
}

export interface MappedExtraction {
  skills: SkillSuggestionInput[];
  opportunities: OpportunityInput[];
  cases: CaseInput[];
}

/** Referência da fonte do skill: `checkpoint:<id>` (decisão da fatia). */
export function checkpointSourceEntryId(checkpointId: string): string {
  return `checkpoint:${checkpointId}`;
}

/**
 * Converte a saída VALIDADA da IA nos inputs de criação das 3 trilhas, aplicando
 * o mapeamento de skills (→ SkillSuggestion) e a normalização de level/kind/
 * priority (com defaults seguros). Função PURA e testável.
 */
export function mapExtraction(
  output: ExtractionOutput,
  ctx: CheckpointExtractionContext,
): MappedExtraction {
  const skills: SkillSuggestionInput[] = output.skills.map((s) => ({
    consultantId: ctx.consultantId,
    weekStart: ctx.weekStart,
    weekEnd: ctx.weekEnd,
    suggestedName: s.name,
    suggestedCategory: s.category ?? null,
    suggestedLevel: normalizeSkillLevel(s.level),
    evidenceSummary: s.quote ?? null,
    sourceEntryIds: [checkpointSourceEntryId(ctx.checkpointId)],
  }));

  const opportunities: OpportunityInput[] = output.opportunities.map((o) => ({
    sourceCheckpointId: ctx.checkpointId,
    consultantId: ctx.consultantId,
    relatedProjectId: ctx.relatedProjectId ?? null,
    kind: normalizeOpportunityKind(o.kind),
    title: o.title,
    // Junta a pista de cliente (texto livre, sem virar FK) à descrição.
    description: composeOpportunityDescription(o),
    priority: normalizeOpportunityPriority(o.priority),
    sourceQuote: o.quote ?? null,
  }));

  const cases: CaseInput[] = output.cases.map((c) => ({
    sourceCheckpointId: ctx.checkpointId,
    consultantId: ctx.consultantId,
    relatedProjectId: ctx.relatedProjectId ?? null,
    title: c.title,
    summary: c.summary ?? null,
    outcome: c.outcome ?? null,
    sourceQuote: c.quote ?? null,
  }));

  return { skills, opportunities, cases };
}

function composeOpportunityDescription(o: AiOpportunity): string | null {
  const parts: string[] = [];
  if (o.description) parts.push(o.description);
  if (o.clientHint) parts.push(`Cliente (sugerido pela IA): ${o.clientHint}`);
  return parts.length ? parts.join("\n\n") : null;
}
