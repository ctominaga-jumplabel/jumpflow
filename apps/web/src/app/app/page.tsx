import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LauncherView } from "@/components/launcher/LauncherView";
import { getCurrentUser } from "@/lib/auth/current-user";
import { landingPathFor } from "@/lib/auth/redirects";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  financialSectors,
  isFinancialLauncher,
  isPendingClosingLauncher,
  mockLauncherBadges,
  PENDING_CLOSING_PATH,
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

  // EP-M09: o Consultor não usa o launcher — sua home é o Feed (ou o fallback
  // seguro quando a flag do Feed está off). `redirect()` lança internamente,
  // então fica antes de qualquer render. Demais perfis seguem no launcher.
  if (user) {
    const landing = landingPathFor(user.roles);
    if (landing !== "/app") redirect(landing);

    // Melhorias v2: o AREA_MANAGER (sem ADMIN/FINANCE) não usa Contas a
    // Receber/Pagar — sua entrada é a fila de liberação (Pendentes de
    // Fechamento). Precedência: [ADMIN|FINANCE] veem os 3 cards abaixo; senão
    // AREA_MANAGER é redirecionado; demais perfis seguem na grade. `redirect()`
    // lança internamente, então fica antes de qualquer render/carga de badges.
    if (isPendingClosingLauncher(user)) redirect(PENDING_CLOSING_PATH);
  }

  const firstName = user?.name.split(" ")[0] ?? "";
  const shortcuts = shortcutsForUser(user);

  let badges = user ? mockLauncherBadges() : {};
  if (user && isDatabaseConfigured()) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { getLauncherBadges } = await import("@/lib/db/launcher-badges");
    badges = await getLauncherBadges(user);
  }

  // Melhorias v2 (2026-07-25): [ADMIN, FINANCE] veem a home de 3 cards (Contas a
  // Receber, Contas a Pagar, Pendentes de Fechamento). O AREA_MANAGER já foi
  // redirecionado acima; os demais perfis mantêm a grade de atalhos.
  if (isFinancialLauncher(user)) {
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
