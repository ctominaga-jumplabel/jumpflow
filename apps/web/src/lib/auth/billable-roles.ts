import type { RoleName } from "./roles";

/**
 * Papéis de gestão/financeiro que podem DEFINIR livremente o campo financeiro
 * `TimeEntry.billable` (toggle "Faturar?"). Fonte ÚNICA compartilhada
 * (CLAUDE.md: proteger campo financeiro por papel) entre:
 *
 *  - a server action `setEntryBillable` (`app/app/horas/actions.ts`), a
 *    autoridade que persiste/audita a decisão;
 *  - o gate visual do toggle na jornada Contas a Receber
 *    (`app/app/financeiro/page.tsx`), que apenas espelha o mesmo conjunto.
 *
 * Módulo PURO (sem "use server" e sem imports server-only), então pode ser
 * importado tanto por um arquivo de server actions quanto por um Server
 * Component sem violar a regra "só exports async em actions.ts".
 *
 * Consultor puro NUNCA dita `billable` — o servidor deriva pela regra de
 * negócio (ON_CALL = não faturável). Esconder o controle no client é cosmético;
 * a autoridade é o servidor.
 */
export const BILLABLE_MANAGER_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "PROJECT_MANAGER",
  "FINANCE",
];
