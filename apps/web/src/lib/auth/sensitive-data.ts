import { redirect } from "next/navigation";
import type { AppUser } from "./types";
import { SENSITIVE_DATA_ROLE } from "./roles";
import { hasRole } from "./route-permissions";
import { requireUser } from "./guards";

/**
 * Acesso ao custo do consultor (valor hora de custo + valores acordados de
 * remuneração). Regra de negócio: SOMENTE o grupo "Dados Sensíveis" vê/edita.
 *
 * Diferente do restante do RBAC, aqui NÃO há ponte com a Matriz de Permissões
 * nem com FINANCIAL_ROLES/ADMIN: a pertença ao grupo é a única chave. Quem
 * precisa do acesso é adicionado ao grupo (ação auditada em Acessos).
 *
 * Cálculos agregados de servidor (pagamento, margem, risco) continuam usando o
 * custo internamente; o que esta regra protege é a EXIBIÇÃO e a EDIÇÃO do valor
 * unitário do consultor.
 */
export function canAccessSensitiveCost(user: AppUser | null): boolean {
  return hasRole(user, SENSITIVE_DATA_ROLE);
}

/**
 * Exige o grupo Dados Sensíveis. Redireciona para `/login` sem sessão ou para
 * `/access-denied` sem o grupo (mesma semântica de `requireRole`).
 */
export async function requireSensitiveData(): Promise<AppUser> {
  const user = await requireUser();
  if (!canAccessSensitiveCost(user)) redirect("/access-denied");
  return user;
}
