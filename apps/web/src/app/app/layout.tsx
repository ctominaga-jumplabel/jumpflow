import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell/AppShell";
import { NathaliaMount } from "@/components/nathalia/NathaliaMount";
import { isNathaliaFeatureEnabled } from "@/lib/nathalia/flags";
import { getNathaliaSignals } from "@/lib/nathalia/signals";
import { requireUser } from "@/lib/auth/guards";
import { logout } from "@/lib/auth/actions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { getCurrentMatrix } from "@/lib/auth/permissions";
import { shouldGateTerms } from "@/lib/terms/gate";
import { isTermsGateEnabled } from "@/lib/terms/flags";
import {
  filterViewableCodes,
  matrixAllows,
} from "@/lib/auth/permission-codes";
import { findActiveNav, navPermissionCodes } from "@/lib/navigation";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  // Terms-of-use gate (EP-M08): without an acceptance of the CURRENT terms
  // version the user cannot reach the platform — redirect to `/termos`.
  //
  // Fail-safe (mirrors `getCurrentMatrix`): in dev mode or with no database
  // there is nowhere to persist/read an acceptance, so the gate is skipped —
  // blocking would lock everyone out of demo/offline setups. Only the real
  // session + database path enforces the gate. The read itself fails OPEN on a
  // transient database error (see `hasAcceptedCurrentTerms`) to avoid a global
  // lockout during database downtime.
  const termsEnabled = isTermsGateEnabled();
  const devMode = isDevAuthEnabled();
  const dbConfigured = isDatabaseConfigured();
  let acceptedTerms = true;
  if (termsEnabled && !devMode && dbConfigured) {
    const { hasAcceptedCurrentTerms } = await import("@/lib/db/terms");
    acceptedTerms = await hasAcceptedCurrentTerms(user.id);
  }
  if (
    shouldGateTerms({
      enabled: termsEnabled,
      devMode,
      dbConfigured,
      accepted: acceptedTerms,
    })
  ) {
    redirect("/termos");
  }

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

  // Persisted GLOBAL menu order (P28) and the actionable-pending total for the
  // notification bell (P20). Both are resolved server-side and fail safe: the
  // menu falls back to the default order, the bell to zero — a slow/absent
  // database never blocks the shell.
  const { getNavigationOrder } = await import("@/lib/db/navigation-order");
  const navOrder = await getNavigationOrder();

  // Item 3: real in-app notification center. The bell now reflects the user's
  // UNREAD notifications (not the actionable-pending count, which stays on the
  // Início launcher). Fails safe to an empty inbox: a slow/absent database or an
  // unresolvable user never blocks the shell.
  let notifications: import("@/lib/db/notifications").NotificationView[] = [];
  let unreadCount = 0;
  if (dbConfigured) {
    try {
      const { resolveDbUser } = await import("@/lib/db/users");
      const dbUser = await resolveDbUser(user);
      if (dbUser) {
        const { listUserNotifications, countUnreadNotifications } = await import(
          "@/lib/db/notifications"
        );
        [notifications, unreadCount] = await Promise.all([
          listUserNotifications(dbUser.id, { limit: 12 }),
          countUnreadNotifications(dbUser.id),
        ]);
      }
    } catch (error) {
      console.error("[app-layout] notifications load failed", error);
      notifications = [];
      unreadCount = 0;
    }
  }

  // Nathal.IA master switch. Read server-side so it can be flipped at runtime
  // (Vercel env) with no rebuild. Default OFF: the assistant does not exist —
  // no mount, no client bundle, no signal computation — until NATHALIA_ENABLED
  // is set to "true". Keeps the whole feature dark in prod until intentionally
  // turned on.
  const nathaliaEnabled = isNathaliaFeatureEnabled();
  const nathaliaSignals = nathaliaEnabled
    ? await getNathaliaSignals({ id: user.id, roles: user.roles })
    : undefined;

  return (
    <AppShell
      user={user}
      logoutAction={logout}
      databaseConfigured={isDatabaseConfigured()}
      viewableNavCodes={viewableNavCodes}
      navOrder={navOrder}
      notifications={notifications}
      unreadCount={unreadCount}
    >
      {children}
      {/* Nathal.IA — contextual assistant, authenticated app only, gated by the
          NATHALIA_ENABLED master switch (default off). */}
      {nathaliaEnabled ? (
        <NathaliaMount
          user={{ id: user.id, name: user.name, roles: user.roles }}
          signals={nathaliaSignals}
        />
      ) : null}
    </AppShell>
  );
}
