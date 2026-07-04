import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LauncherView } from "@/components/launcher/LauncherView";
import { getCurrentUser } from "@/lib/auth/current-user";
import { landingPathFor } from "@/lib/auth/redirects";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  mockLauncherBadges,
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
  }

  const firstName = user?.name.split(" ")[0] ?? "";
  const shortcuts = shortcutsForUser(user);

  let badges = user ? mockLauncherBadges() : {};
  if (user && isDatabaseConfigured()) {
    // Lazy import so Prisma is never loaded on code paths without a database.
    const { getLauncherBadges } = await import("@/lib/db/launcher-badges");
    badges = await getLauncherBadges(user);
  }

  return (
    <LauncherView firstName={firstName} shortcuts={withBadges(shortcuts, badges)} />
  );
}
