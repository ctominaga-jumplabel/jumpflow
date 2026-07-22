import type { Metadata } from "next";
import { ListOrdered } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MenuOrderView } from "@/components/admin/MenuOrderView";
import { requireRole } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";

export const metadata: Metadata = { title: "Ordem do Menu" };

/**
 * Admin-only primary-menu ordering (`/app/admin/menu`, P28). Reorders the
 * primary sidebar items with a GLOBAL (org-wide) persisted order. ADMIN-only;
 * every change is audited. The order is applied by the app shell on the next
 * navigation.
 */
export default async function MenuOrderPage() {
  await requireRole(["ADMIN"]);

  const header = (
    <PageHeader
      eyebrow="Administração"
      title="Ordem do Menu"
      description="Defina a ordem dos itens do menu principal. Vale para toda a organização — deixe lado a lado o que sua operação usa junto (ex.: Horas, Aprovações, Skills, Certificados)."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={ListOrdered}
          title="Banco não configurado"
          description="A ordem do menu é persistida no banco. Configure a conexão para personalizá-la."
        />
      </div>
    );
  }

  const { getNavigationOrder } = await import("@/lib/db/navigation-order");
  const savedOrder = await getNavigationOrder();

  return (
    <div className="space-y-6">
      {header}
      <MenuOrderView savedOrder={savedOrder} />
    </div>
  );
}
