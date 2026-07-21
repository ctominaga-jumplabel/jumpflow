/**
 * Welcome experience for Nathal.IA (Fase 8.1, Etapa 4).
 *
 * Replaces the generic "Oi! Sou a Nathal.IA..." opener with a contextual,
 * named greeting: "Olá, Ana! Vejo que você está em Horas. Posso ajudar com
 * lançamentos, status ou envio dos apontamentos."
 *
 * Pure and three-free — safe to import from the store, the server and tests. It
 * composes the Context Engine (`nathaliaContext.ts`) without pulling in the FAQ
 * engine, so opening the panel stays cheap.
 */
import { getNathaliaContext } from "./nathaliaContext";
import type { NathaliaContextKey, NathaliaUser } from "./nathaliaTypes";

export interface NathaliaWelcome {
  /** Personal greeting line, e.g. "Olá, Ana!". */
  greeting: string;
  /** The contextual help body. */
  body: string;
  /** `greeting` + `body` joined for a single-paragraph headline. */
  full: string;
}

/**
 * Per-context welcome body. The `general`/`dashboard` openers describe the broad
 * value; every other screen acknowledges where the user is ("Vejo que você está
 * em ...") and offers that screen's concrete help. Kept short and human
 * (Etapa 7) — one sentence, no jargon.
 */
const welcomeBodies: Record<NathaliaContextKey, string> = {
  general:
    "Posso ajudar você a navegar pelo JumpFlow, lançar horas, acompanhar aprovações e encontrar informações rapidamente.",
  dashboard:
    "Posso explicar os indicadores do seu painel e te levar direto para onde a ação acontece.",
  hours:
    "Vejo que você está em Horas. Posso ajudar com lançamentos, status ou envio dos apontamentos.",
  expenses:
    "Vejo que você está em Despesas. Posso ajudar a lançar, anexar comprovantes e acompanhar o reembolso.",
  projects:
    "Posso ajudar a entender os projetos, vínculos e indicadores desta tela.",
  clients:
    "Vejo que você está em Clientes. Posso explicar cadastros, dados fiscais e tipos de cobrança.",
  consultants:
    "Vejo que você está em Consultores. Posso explicar cadastro, senioridade e disponibilidade.",
  approvals:
    "Vejo que você está em Aprovações. Posso ajudar a entender a fila, o que está pendente e como aprovar.",
  reports:
    "Vejo que você está em Relatórios. Posso ajudar a gerar, filtrar e exportar os dados.",
  finance:
    "Vejo que você está no Financeiro. Posso explicar os conceitos — sem mostrar valores sensíveis.",
  settings:
    "Vejo que você está em Acessos. Posso explicar convites, perfis e grupos de acesso.",
};

/** Extract a friendly first name from a user, or null when unknown. */
export function nathaliaFirstName(user: NathaliaUser | null | undefined): string | null {
  const name = user?.name?.trim();
  if (!name) return null;
  // First token only; collapse odd whitespace.
  const first = name.split(/\s+/)[0];
  return first || null;
}

/**
 * Build the contextual welcome for a screen + user. Falls back to a warm,
 * name-less greeting when the user is unknown.
 */
export function nathaliaWelcome(
  context: NathaliaContextKey,
  user: NathaliaUser | null | undefined,
): NathaliaWelcome {
  const first = nathaliaFirstName(user);
  const greeting = first ? `Olá, ${first}!` : "Olá!";
  const body = welcomeBodies[context] ?? getNathaliaContext(context).greeting;
  return { greeting, body, full: `${greeting} ${body}` };
}
