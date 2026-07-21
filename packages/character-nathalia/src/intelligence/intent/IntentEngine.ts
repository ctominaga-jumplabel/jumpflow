/**
 * IntentEngine — rule-based intent detection for Nathal.IA (Fase 8, Etapa 6).
 *
 * No LLM. Classifies a free-text message into a small set of intents using
 * normalized keyword/trigger rules. Deterministic and SSR-safe. The detected
 * intent drives the brain: navigation/tour → a tool; explain/teach/question →
 * the FAQ/knowledge layers; greeting → a welcome; unknown → graceful fallback.
 */
import { normalizeText, tokenize } from "../text";
import type { NathaliaContextKey } from "../../nathaliaTypes";

export type NathaliaIntentKind =
  | "greeting"
  | "navigate"
  | "tour"
  | "teach"
  | "explain"
  | "question"
  | "unknown";

export interface DetectedIntent {
  kind: NathaliaIntentKind;
  /** Heuristic confidence in [0, 1]. */
  confidence: number;
  /** Target screen for navigate/tour intents, when one is named. */
  targetContext?: NathaliaContextKey;
  /** The trigger that matched (for the lab / debugging). */
  matched?: string;
}

/** Keyword → context map used to resolve navigation/tour targets. */
const CONTEXT_KEYWORDS: Array<{ context: NathaliaContextKey; words: string[] }> = [
  { context: "hours", words: ["hora", "horas", "ponto", "timesheet", "apontamento"] },
  { context: "expenses", words: ["despesa", "despesas", "reembolso"] },
  { context: "projects", words: ["projeto", "projetos", "alocacao", "alocacoes"] },
  { context: "approvals", words: ["aprovacao", "aprovacoes", "aprovar", "fila"] },
  { context: "reports", words: ["relatorio", "relatorios"] },
  { context: "clients", words: ["cliente", "clientes"] },
  { context: "consultants", words: ["consultor", "consultores"] },
  { context: "finance", words: ["financeiro", "fechamento", "faturamento", "pagamento"] },
  { context: "settings", words: ["acesso", "acessos", "permissao", "permissoes", "admin"] },
];

const GREETING_TRIGGERS = [
  "oi", "ola", "bom dia", "boa tarde", "boa noite", "e ai", "eai", "hello", "hi", "opa",
];
const NAVIGATE_TRIGGERS = [
  "ir para", "ir a", "abrir", "abre", "me leva", "leva para", "vai para",
  "vamos para", "navegar", "ir pra", "me leve",
];
const TOUR_TRIGGERS = [
  "tour", "me mostre", "me mostra", "mostrar a tela", "guia", "passo a passo da tela",
  "me ensina a tela", "tour da tela",
];
const TEACH_TRIGGERS = ["como", "de que forma", "qual a forma", "preciso saber como"];
const EXPLAIN_TRIGGERS = [
  "o que e", "o que significa", "o que sao", "explica", "explique", "explicar",
  "por que", "porque", "para que serve", "pra que serve", "o que vejo", "o que tem",
];

function detectTargetContext(normalized: string): NathaliaContextKey | undefined {
  const tokens = new Set(tokenize(normalized));
  for (const { context, words } of CONTEXT_KEYWORDS) {
    if (words.some((w) => tokens.has(w))) return context;
  }
  return undefined;
}

function startsWithAny(normalized: string, triggers: string[]): string | undefined {
  return triggers.find((t) => normalized === t || normalized.startsWith(`${t} `));
}

function includesAny(normalized: string, triggers: string[]): string | undefined {
  return triggers.find((t) => normalized.includes(t));
}

export interface IntentOptions {
  /** Current screen, used as the navigate/tour target when none is named. */
  context?: NathaliaContextKey;
}

/** Detect the intent of a user message. Pure and deterministic. */
export function detectIntent(text: string, options: IntentOptions = {}): DetectedIntent {
  const normalized = normalizeText(text);
  if (!normalized) return { kind: "unknown", confidence: 0 };

  const isQuestion = text.trim().endsWith("?");
  const namedContext = detectTargetContext(normalized);

  // 1) Greeting — only when it leads the message (avoids "oi, como lanço horas?").
  const greet = startsWithAny(normalized, GREETING_TRIGGERS);
  if (greet && tokenize(normalized).length <= 3) {
    return { kind: "greeting", confidence: 0.9, matched: greet };
  }

  // 2) Tour — explicit "show me the screen".
  const tour = includesAny(normalized, TOUR_TRIGGERS);
  if (tour) {
    return {
      kind: "tour",
      confidence: 0.8,
      targetContext: namedContext ?? options.context,
      matched: tour,
    };
  }

  // 3) Navigation — "ir para / abrir <tela>". Needs a target to be meaningful.
  const nav = includesAny(normalized, NAVIGATE_TRIGGERS);
  if (nav && (namedContext || options.context)) {
    return {
      kind: "navigate",
      confidence: namedContext ? 0.85 : 0.55,
      targetContext: namedContext ?? options.context,
      matched: nav,
    };
  }

  // 4) Teach — procedural "como ...".
  const teach = startsWithAny(normalized, TEACH_TRIGGERS) ?? includesAny(normalized, ["como "]);
  if (teach) {
    return { kind: "teach", confidence: 0.7, targetContext: namedContext, matched: teach };
  }

  // 5) Explain — conceptual "o que é / por que".
  const explain = includesAny(normalized, EXPLAIN_TRIGGERS);
  if (explain) {
    return { kind: "explain", confidence: 0.7, targetContext: namedContext, matched: explain };
  }

  // 6) Generic question (has a "?" or names a topic) → route to FAQ/knowledge.
  if (isQuestion || namedContext) {
    return { kind: "question", confidence: 0.5, targetContext: namedContext };
  }

  return { kind: "unknown", confidence: 0.2, targetContext: namedContext };
}
