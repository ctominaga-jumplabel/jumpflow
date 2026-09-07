import type { RoleName } from "@/lib/auth/roles";
// Importado do módulo FOLHA (não de `route-permissions`): `route-permissions`
// importa ESTE arquivo para montar a regra de rota, e o ciclo fazia a constante
// resolver como `undefined` conforme a ordem de inicialização.
import { FINANCIAL_ROLES } from "@/lib/auth/roles";

/**
 * Pure RBAC helpers for the COE — Centro Operacional de Excelência. No I/O, so
 * o guard da página, a função de read e as server actions compartilham uma
 * única fonte da verdade e a permissão é sempre checada no servidor.
 *
 * O COE tem TRÊS fronteiras distintas, que não devem ser confundidas:
 *   1. quem LÊ a tela (núcleo + composição + propostas);
 *   2. quem CURA o núcleo (marca/desmarca consultor estratégico);
 *   3. quem SALVA uma proposta de time.
 */

/**
 * Papéis que LEEM o COE. É a união de quem aloca (ADMIN/AREA_MANAGER/
 * PROJECT_MANAGER/SALES, como em ALLOCATION_AI_READ_ROLES) com PEOPLE, que aqui
 * — diferente da IA de Alocação — participa: a curadoria do núcleo é uma decisão
 * de gestão de talentos, não de staffing comercial. FINANCE fica de fora: o COE
 * é uma superfície de capacidade, não financeira.
 */
export const COE_READ_ROLES: RoleName[] = [
  "ADMIN",
  "PEOPLE",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
];

/**
 * Papéis que CURAM o núcleo. Dizer "esta pessoa é estratégica para a Jump" é
 * governança de talentos: ADMIN, PEOPLE e AREA_MANAGER. PROJECT_MANAGER e SALES
 * consomem o núcleo para compor times, mas não decidem quem entra nele — senão a
 * curadoria vira reflexo da demanda do projeto da vez.
 */
export const COE_CURATE_ROLES: RoleName[] = ["ADMIN", "PEOPLE", "AREA_MANAGER"];

/**
 * Papéis que SALVAM propostas de time. São os que respondem pela operação do
 * projeto (mesma fronteira de PROJECT_WRITE_ROLES). PEOPLE lê e cura, mas não
 * propõe staffing.
 */
export const COE_SQUAD_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "SALES",
];

/** Whether the user may curate the COE núcleo (add/edit/remove members). */
export function canCurateCoe(roles: readonly RoleName[]): boolean {
  return roles.some((r) => COE_CURATE_ROLES.includes(r));
}

/** Whether the user may create/update/delete squad proposals. */
export function canWriteCoeSquad(roles: readonly RoleName[]): boolean {
  return roles.some((r) => COE_SQUAD_WRITE_ROLES.includes(r));
}

/**
 * O fator financeiro do fit (custo × valor de venda → margem) só é computado
 * para FINANCIAL_ROLES, exatamente como na IA de Alocação — o servidor nem busca
 * o dado para os demais. Note que PROJECT_MANAGER e SALES compõem times sem ver
 * margem, e que PEOPLE também não vê.
 */
export function includeFinancialFactor(roles: readonly RoleName[]): boolean {
  return roles.some((r) => FINANCIAL_ROLES.includes(r));
}
