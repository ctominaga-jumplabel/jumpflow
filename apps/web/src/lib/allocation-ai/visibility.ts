import type { RoleName } from "@/lib/auth/roles";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";

/**
 * Pure RBAC helpers for the IA de Alocação (§8.2). No I/O. The page guard and the
 * DB read use these so "who alloca" and "who sees the financial factor" live in a
 * single source of truth and are enforced on the server (docs/p3-inteligencia-
 * design.md §5).
 */

/**
 * Papéis que ALOCAM e portanto acessam a sugestão de alocação. Alinhado ao
 * design §5 (quem vê: gestão + comercial) e à convenção de PROJECT_WRITE_ROLES /
 * SALE_RATE_ROLES: ADMIN, AREA_MANAGER, PROJECT_MANAGER, SALES. PEOPLE não
 * participa da decisão operacional de alocação (cuida de talentos, não de
 * staffing comercial), coerente com o escopo desta tela.
 */
export const ALLOCATION_AI_READ_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
];

/**
 * O fator financeiro (custo/valor hora → margem) só é computado e exibido para
 * FINANCIAL_ROLES (ADMIN/AREA_MANAGER/FINANCE). Para os demais, a engine roda sem
 * o fator (não é mascarar a saída — o servidor nem busca o dado financeiro). Note
 * que SALES e PROJECT_MANAGER alocam mas NÃO veem margem.
 */
export function includeFinancialFactor(roles: readonly RoleName[]): boolean {
  return roles.some((r) => FINANCIAL_ROLES.includes(r));
}
