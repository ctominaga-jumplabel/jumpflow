/**
 * CRM -> JumpFlow seniority de/para (FASE 1, ingestao / D6).
 *
 * O CRM manda `Seniority.name` como string livre. O alvo no JumpFlow e o
 * `enum Seniority` (INTERN | JUNIOR | MID_LEVEL | SENIOR | SPECIALIST |
 * PRINCIPAL | TRAINEE | TECH_LEAD | ARCHITECT | COORDINATOR | MANAGER). Este e o
 * unico de/para de perfil que tem alvo tipado (cargo e texto livre, ver D6).
 *
 * Modulo PURO: sem "use server", sem I/O.
 *
 * DECISAO DE NEGOCIO (fidelidade total): o catalogo de senioridade do JumpFlow
 * agora e 1:1 com o do CRM (10 niveis + PRINCIPAL, exclusivo do JumpFlow). O mapa
 * abaixo cobre os nomes do enum (case-insensitive) + os 10 niveis do CRM em PT;
 * qualquer valor fora dele cai no fallback MID_LEVEL + warning SENIORITY_UNMAPPED.
 */

/** Valores validos do `enum Seniority` do JumpFlow (uniao string = tipo Prisma). */
export type SeniorityValue =
  | "INTERN"
  | "JUNIOR"
  | "MID_LEVEL"
  | "SENIOR"
  | "SPECIALIST"
  | "PRINCIPAL"
  | "TRAINEE"
  | "TECH_LEAD"
  | "ARCHITECT"
  | "COORDINATOR"
  | "MANAGER";

/** Fallback quando o valor recebido nao tem de/para conhecido. */
export const SENIORITY_FALLBACK: SeniorityValue = "MID_LEVEL";

/** Prefixo do warning emitido quando cai no fallback. */
export const WARNING_SENIORITY_UNMAPPED = "SENIORITY_UNMAPPED";

/**
 * De/para explicito (chaves normalizadas: uppercase, sem acento, trim).
 * Cobre os nomes do enum (match direto) + os 10 niveis do catalogo do CRM em PT
 * (fidelidade total). Estagiario e Trainee sao niveis DISTINTOS no CRM: mapeiam
 * para INTERN e TRAINEE respectivamente.
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
  TRAINEE: "TRAINEE",
  TECH_LEAD: "TECH_LEAD",
  ARCHITECT: "ARCHITECT",
  COORDINATOR: "COORDINATOR",
  MANAGER: "MANAGER",
  // Aliases PT / abreviacoes comuns (10 niveis do CRM)
  ESTAGIARIO: "INTERN",
  ESTAGIO: "INTERN",
  JR: "JUNIOR",
  PLENO: "MID_LEVEL",
  PL: "MID_LEVEL",
  MID: "MID_LEVEL",
  SR: "SENIOR",
  SENIOR2: "SENIOR",
  ESPECIALISTA: "SPECIALIST",
  PRINCIPAL_ENGINEER: "PRINCIPAL",
  TECHLEAD: "TECH_LEAD",
  ARQUITETO: "ARCHITECT",
  COORDENADOR: "COORDINATOR",
  GERENTE: "MANAGER",
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
