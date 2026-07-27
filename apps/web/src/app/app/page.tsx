import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LauncherView } from "@/components/launcher/LauncherView";
import { getCurrentUser } from "@/lib/auth/current-user";
import { feedHomePath } from "@/lib/auth/redirects";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  financialSectors,
  isAdminLauncher,
  isExclusivelyFinance,
  mockLauncherBadges,
  sectorsWithBadges,
  shortcutsForUser,
  withBadges,
} from "@/lib/launcher";

export const metadata: Metadata = { title: "Início" };

/**
 * Operational launcher home. Replaces the old redirect to /app/dashboard:
 * `/app` is now the consultant-first entry point with role-filtered shortcuts.
 * The dashboard remains reachable from the sidebar.
 *
 * Badges are merged onto the (pure) shortcuts here: REAL counts from
 * `getLauncherBadges` when a database is configured, otherwise the honest
 * demo-mode counts derived from mock data.
 */
export default async function AppIndex() {
  const user = await getCurrentUser();

  // Tela inicial (`/app`) por papel (correções de navegação, 2026-07-27):
  //  - ADMIN → grade de atalhos operacional (isAdminLauncher, tem precedência);
  //  - Financeiro-exclusivo (só FINANCE) → home de 3 cards (setores);
  //  - todos os demais (AREA_MANAGER, PM, SALES, PEOPLE, CONSULTANT e combos que
  //    não sejam Admin nem Financeiro-exclusivo) → Feed (ou fallback Horas).
  // `redirect()` lança internamente, então o redirect fica antes de qualquer
  // render/carga de badges. Como isExclusivelyFinance exige TODOS os papéis ==
  // FINANCE, um ADMIN+FINANCE cai na grade (Admin) sem conflito de precedência.
  if (user && !isAdminLauncher(user) && !isExclusivelyFinance(user)) {
    redirect(feedHomePath());
  }

  const firstName = user?.name.split(" ")[0] ?? "";
  const shortcuts = shortcutsForUser(user);

  let badges = user ? mockLauncherBadges() : {};
  if (user && isDatabaseConfigured()) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { getLauncherBadges } = await import("@/lib/db/launcher-badges");
    badges = await getLauncherBadges(user);
  }

  // Financeiro-exclusivo: home de 3 cards (Contas a Receber, Contas a Pagar,
  // Pendentes de Fechamento). O ADMIN e os demais perfis já foram tratados acima
  // (grade / redirect ao Feed).
  if (isExclusivelyFinance(user)) {
    return (
      <LauncherView
        firstName={firstName}
        shortcuts={[]}
        sectors={sectorsWithBadges(financialSectors, badges)}
      />
    );
  }

  return (
    <LauncherView firstName={firstName} shortcuts={withBadges(shortcuts, badges)} />
  );
}
