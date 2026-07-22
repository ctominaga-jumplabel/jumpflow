/**
 * Resolução do destinatário do "solicitar feedback ao cliente" (P29).
 *
 * Precedência: e-mail explícito informado pelo usuário → primeiro e-mail de
 * cobrança do cliente (billingEmails) → e-mail de contato do cliente. Retorna
 * null quando nenhum existe (a action recusa com NO_CONTACT_EMAIL). Puro, sem
 * I/O — testável isoladamente.
 */
export interface FeedbackRequestClientContact {
  billingEmails?: string[] | null;
  contactEmail?: string | null;
}

export function resolveFeedbackRequestEmail(
  explicit: string | null | undefined,
  client: FeedbackRequestClientContact | null,
): string | null {
  const typed = explicit?.trim();
  if (typed) return typed;
  const billing = client?.billingEmails?.find(
    (e) => typeof e === "string" && e.trim().length > 0,
  );
  if (billing) return billing.trim();
  const contact = client?.contactEmail?.trim();
  return contact && contact.length > 0 ? contact : null;
}
