import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/AppShell";
import { requireUser } from "@/lib/auth/guards";
import { logout } from "@/lib/auth/actions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getCurrentMatrix } from "@/lib/auth/permissions";
import {
  filterViewableCodes,
  matrixAllows,
} from "@/lib/auth/permission-codes";
import { findActiveNav, navPermissionCodes } from "@/lib/navigation";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  // Permission matrix (database-driven RBAC). Used for both route enforcement
  // (403 on direct URL access) and to gate the navigation menu by `can_view`.
  const matrix = await getCurrentMatrix();

  // Route protection: resolve the active nav entry from the request pathname
  // (set by the auth `authorized` callback) and enforce its `view` permission.
  // This covers direct URL access; sensitive pages keep their own guards too.
  const pathname = (await headers()).get("x-pathname") ?? "";
  const activeNav = pathname ? findActiveNav(pathname) : undefined;
  if (
    activeNav?.permissionCode &&
    !matrixAllows(matrix, activeNav.permissionCode, "view")
  ) {
    redirect("/access-denied");
  }

  // Codes the user may VIEW, scoped to the nav catalog — passed to the shell so
  // the sidebar hides items the matrix denies.
  const viewableNavCodes = filterViewableCodes(matrix, navPermissionCodes());

  return (
    <AppShell
      user={user}
      logoutAction={logout}
      databaseConfigured={isDatabaseConfigured()}
      viewableNavCodes={viewableNavCodes}
    >
      {children}
    </AppShell>
  );
}
