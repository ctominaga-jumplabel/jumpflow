/**
 * CRM -> JumpFlow seniority de/para (FASE 1, ingestao / D6).
 *
 * O CRM manda `Seniority.name` como string livre. O alvo no JumpFlow e o
 * `enum Seniority` (INTERN | JUNIOR | MID_LEVEL | SENIOR | SPECIALIST |
 * PRINCIPAL). Este e o unico de/para de perfil que tem alvo tipado (cargo e
 * texto livre, ver D6).
 *
 * Modulo PURO: sem "use server", sem I/O.
 *
 * DECISAO DE NEGOCIO EM ABERTO: o mapa final de aliases (nomes/idiomas aceitos)
 * e uma decisao de sessao conjunta (respostas-fase1 §5.4 / contrato §3.1). O mapa
 * abaixo cobre os nomes do enum (case-insensitive) + aliases PT comuns; qualquer
 * valor fora dele cai no fallback MID_LEVEL + warning SENIORITY_UNMAPPED.
 */

/** Valores validos do `enum Seniority` do JumpFlow (uniao string = tipo Prisma). */
export type SeniorityValue =
  | "INTERN"
  | "JUNIOR"
  | "MID_LEVEL"
  | "SENIOR"
  | "SPECIALIST"
  | "PRINCIPAL";

/** Fallback quando o valor recebido nao tem de/para conhecido. */
export const SENIORITY_FALLBACK: SeniorityValue = "MID_LEVEL";

/** Prefixo do warning emitido quando cai no fallback. */
export const WARNING_SENIORITY_UNMAPPED = "SENIORITY_UNMAPPED";

/**
 * De/para explicito (chaves normalizadas: uppercase, sem acento, trim).
 * Cobre os nomes do enum + aliases PT comuns. PONTO EM ABERTO: ampliar/curar
 * na sessao conjunta de negocio.
 */
const SENIORITY_ALIASES: Record<string, SeniorityValue> = {
  // Nomes do enum (match direto)
  INTERN: "INTERN",
  JUNIOR: "JUNIOR",
  MID_LEVEL: "MID_LEVEL",
  MIDLEVEL: "MID_LEVEL",
  SENIOR: "SENIOR",
  SPECIALIST: "SPECIALIST",
  PRINCIPAL: "PRINCIPAL",
  // Aliases PT / abreviacoes comuns
  ESTAGIARIO: "INTERN",
  ESTAGIO: "INTERN",
  TRAINEE: "INTERN",
  JR: "JUNIOR",
  PLENO: "MID_LEVEL",
  PL: "MID_LEVEL",
  MID: "MID_LEVEL",
  SR: "SENIOR",
  SENIOR2: "SENIOR",
  ESPECIALISTA: "SPECIALIST",
  PRINCIPAL_ENGINEER: "PRINCIPAL",
};

export interface MapSeniorityResult {
  seniority: SeniorityValue;
  warning: string | null;
}

/**
 * Normaliza para match case-insensitive e sem acento: uppercase, remove
 * diacriticos, colapsa espacos/hifens em `_`.
 */
function normalizeSeniority(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

/**
 * Resolve o `enum Seniority` a partir do texto livre do CRM.
 * Sem de/para conhecido => { MID_LEVEL, "SENIORITY_UNMAPPED:<valor original>" }.
 * O warning ecoa o valor ORIGINAL recebido (sem normalizar) para diagnostico.
 */
export function mapSeniority(value: string | null | undefined): MapSeniorityResult {
  const normalized = normalizeSeniority(value);
  const mapped = SENIORITY_ALIASES[normalized];
  if (mapped) {
    return { seniority: mapped, warning: null };
  }
  const received = value ?? "";
  return {
    seniority: SENIORITY_FALLBACK,
    warning: `${WARNING_SENIORITY_UNMAPPED}:${received}`,
  };
}
