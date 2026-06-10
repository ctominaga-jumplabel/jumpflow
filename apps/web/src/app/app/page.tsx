import type { Metadata } from "next";
import { LauncherView } from "@/components/launcher/LauncherView";
import { getCurrentUser } from "@/lib/auth/current-user";
import { shortcutsForUser } from "@/lib/launcher";

export const metadata: Metadata = { title: "Início" };

/**
 * Operational launcher home. Replaces the old redirect to /app/dashboard:
 * `/app` is now the consultant-first entry point with role-filtered shortcuts.
 * The dashboard remains reachable from the sidebar.
 */
export default async function AppIndex() {
  const user = await getCurrentUser();
  const firstName = user?.name.split(" ")[0] ?? "";
  const shortcuts = shortcutsForUser(user);

  return <LauncherView firstName={firstName} shortcuts={shortcuts} />;
}
