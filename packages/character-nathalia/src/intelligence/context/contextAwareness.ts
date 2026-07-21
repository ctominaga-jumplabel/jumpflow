/**
 * Context Awareness V2 for Nathal.IA (Fase 8, Etapa 4).
 *
 * Builds on the existing Context Engine (`nathaliaContext.ts`, route→context)
 * by adding a **screen-specific intelligence message** and the concrete
 * capabilities Nathal.IA offers there — so she says "Posso ajudar a lançar,
 * revisar ou enviar suas horas." instead of a generic greeting.
 *
 * Pure, SSR-safe and RBAC-aware: suggested questions come from the FAQ engine
 * filtered by the user's roles, so restricted topics never appear.
 */
import { contextForPath, getNathaliaContext } from "../../nathaliaContext";
import { defaultFaqEngine, type NathaliaFAQEngine } from "../faq";
import type { NathaliaContextKey } from "../../nathaliaTypes";

export interface ContextAwareness {
  context: NathaliaContextKey;
  /** Human label (pt-BR). */
  label: string;
  /** Screen-specific "Posso ajudar a..." message. */
  message: string;
  /** Short, concrete capabilities offered on this screen. */
  capabilities: string[];
  /** Suggested questions for this screen (RBAC-filtered, from the FAQ). */
  suggestedQuestions: string[];
}

interface AwarenessSeed {
  message: string;
  capabilities: string[];
}

/** Per-context awareness copy. Keep aligned with `nathaliaContexts`. */
const awarenessSeeds: Record<NathaliaContextKey, AwarenessSeed> = {
  general: {
    message:
      "Posso te ajudar a navegar pelo JumpFlow e entender o que cada tela faz.",
    capabilities: ["navegar entre telas", "explicar conceitos", "tirar dúvidas"],
  },
  dashboard: {
    message:
      "Posso explicar os indicadores do seu panorama e te levar para onde a ação acontece.",
    capabilities: ["explicar os cards", "ir para Horas", "ir para Aprovações"],
  },
  hours: {
    message: "Posso te ajudar a lançar, revisar ou enviar suas horas.",
    capabilities: [
      "explicar como lançar horas",
      "explicar como enviar para aprovação",
      "explicar os status",
      "iniciar um tour da tela",
    ],
  },
  expenses: {
    message:
      "Posso te ajudar a lançar despesas, anexar comprovantes e entender o reembolso.",
    capabilities: ["explicar como lançar despesa", "explicar o reembolso"],
  },
  projects: {
    message: "Posso te ajudar a entender os projetos vinculados a você.",
    capabilities: [
      "explicar a lista de projetos",
      "explicar o que é alocação",
      "ir para Projetos",
    ],
  },
  clients: {
    message: "Posso explicar os cadastros de clientes e os tipos de cobrança.",
    capabilities: ["explicar o cadastro de cliente", "explicar dados fiscais"],
  },
  consultants: {
    message:
      "Posso te orientar sobre cadastro, senioridade e disponibilidade dos consultores.",
    capabilities: ["explicar o diretório de consultores"],
  },
  approvals: {
    message:
      "Posso te ajudar a entender a fila de aprovação de horas e despesas.",
    capabilities: [
      "explicar a fila de aprovação",
      "explicar aprovação automática",
      "iniciar um tour da fila",
    ],
  },
  reports: {
    message:
      "Posso te ajudar a encontrar, entender e exportar os relatórios.",
    capabilities: [
      "listar os relatórios",
      "explicar como exportar",
      "explicar o alcance dos dados",
    ],
  },
  finance: {
    message:
      "Posso explicar conceitos do módulo financeiro — sem mostrar valores sensíveis.",
    capabilities: ["explicar o fechamento", "explicar a margem (conceito)"],
  },
  settings: {
    message: "Posso explicar a administração de acessos, convites e perfis.",
    capabilities: ["explicar convites", "explicar grupos de acesso"],
  },
};

export interface AwarenessOptions {
  /** Roles of the asking user (RBAC-filter suggested questions). */
  roles?: string[];
  /** Max suggested questions (default 4). */
  maxQuestions?: number;
  /** Inject an alternative FAQ engine (tests). */
  faqEngine?: NathaliaFAQEngine;
}

/** Build the screen-specific awareness for a context. */
export function awarenessForContext(
  context: NathaliaContextKey,
  options: AwarenessOptions = {},
): ContextAwareness {
  const { roles, maxQuestions = 4, faqEngine = defaultFaqEngine } = options;
  const def = getNathaliaContext(context);
  const seed = awarenessSeeds[context] ?? awarenessSeeds.general;

  const suggestedQuestions = faqEngine
    .list({ context, roles })
    .slice(0, maxQuestions)
    .map((e) => e.question);

  return {
    context,
    label: def.label,
    message: seed.message,
    capabilities: seed.capabilities,
    suggestedQuestions,
  };
}

/** Resolve awareness directly from a pathname. */
export function awarenessForPath(
  pathname: string | null | undefined,
  options: AwarenessOptions = {},
): ContextAwareness {
  return awarenessForContext(contextForPath(pathname), options);
}
