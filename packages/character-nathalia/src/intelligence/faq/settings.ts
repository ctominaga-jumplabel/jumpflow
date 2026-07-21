/** FAQ — Configurações / Acessos. Restricted to administrators. */
import type { NathaliaFaqEntry } from "./types";

export const settingsFaq: NathaliaFaqEntry[] = [
  {
    id: "faq-settings-access",
    question: "O que dá para fazer em Acessos?",
    variations: [
      "como convidar pessoas",
      "gerenciar perfis",
      "administrar acessos",
      "bloquear usuario",
    ],
    answer:
      "Convidar pessoas, definir grupos de acesso (perfis) e bloquear usuários. Esta área é restrita a administradores e mudanças ficam registradas em auditoria.",
    context: "settings",
    roles: ["ADMIN"],
    relatedDocId: "settings-access",
  },
];
