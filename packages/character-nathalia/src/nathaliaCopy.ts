/**
 * Centralized pt-BR copy for Nathal.IA so tone stays consistent and is easy to
 * tweak (or later externalize to i18n). No logic here — strings only.
 *
 * Voice: amigável, leve, divertida e prestativa — sem ser informal demais para
 * um produto B2B. Inspirada na Nathalia, assistente administrativa de horas.
 */
export const nathaliaCopy = {
  /** Display identity. */
  name: "Nathal.IA",
  tagline: "Assistente do JumpFlow",
  /** Used by the avatar alt text / aria labels. */
  shortDescription:
    "Assistente virtual do JumpFlow que ajuda com horas, projetos e aprovações.",

  /** Widget affordances. */
  openLabel: "Abrir a Nathal.IA",
  closeLabel: "Fechar a Nathal.IA",
  minimizeLabel: "Minimizar",
  /** Contextual nudge card (Nível 2). */
  dismissLabel: "Agora não",
  dismissCardLabel: "Dispensar aviso da Nathal.IA",

  /** Panel chrome. */
  inputPlaceholder: "Pergunte algo para a Nathal.IA...",
  sendLabel: "Enviar",
  suggestionsTitle: "Sugestões rápidas",
  followUpsTitle: "Você também pode perguntar",
  notificationDot: "Nathal.IA tem uma novidade",

  /** Generic fallbacks. */
  genericGreeting:
    "Oi! Sou a Nathal.IA. Posso te ajudar a navegar pelo JumpFlow.",
  thinkingLine: "Deixa eu organizar isso...",
  mockNotice:
    "Ainda estou aprendendo 🙂 Por enquanto respondo com orientações fixas — em breve com inteligência de verdade.",

  /** RBAC-related messages. */
  blockedByPermission:
    "Esse assunto é restrito ao seu perfil atual. Posso ajudar com outra coisa?",
  confirmSensitiveAction:
    "Essa ação é sensível. Quer mesmo que eu continue?",
} as const;

export type NathaliaCopy = typeof nathaliaCopy;
