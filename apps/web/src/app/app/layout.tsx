import { AppShell } from "@/components/app-shell/AppShell";
import { requireUser } from "@/lib/auth/guards";
import { logout } from "@/lib/auth/actions";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireUser();

  return (
    <AppShell user={user} logoutAction={logout}>
      {children}
    </AppShell>
  );
}
