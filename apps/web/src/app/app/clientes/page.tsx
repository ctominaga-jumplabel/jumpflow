import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClientsView } from "@/components/clients/ClientsView";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/types";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listBillingTypes, listClients } from "@/lib/db/clients";
import { isCnpjLookupConfigured } from "@/lib/cnpj/provider";
import { isStorageConfigured } from "@/lib/storage/provider";

export const metadata: Metadata = { title: "Clientes" };

const CLIENT_WRITE_ROLES: RoleName[] = [
  "ADMIN",
  "AREA_MANAGER",
  "FINANCE",
  "SALES",
];

export default async function ClientesPage() {
  const user = await requireRole(CLIENT_WRITE_ROLES);
  const databaseReady = isDatabaseConfigured();
  const canViewFinancials = hasRole(user, FINANCIAL_ROLES);
  const canManageClients = hasRole(user, CLIENT_WRITE_ROLES);
  const canManageBillingTypes = hasRole(user, FINANCIAL_ROLES);
  const [clients, billingTypes] = databaseReady
    ? await Promise.all([
        listClients({ includeFinancials: canViewFinancials }),
        listBillingTypes(),
      ])
    : [undefined, undefined];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial e financeiro"
        title="Clientes"
        description="Cadastro de clientes, CNPJ, regras fiscais e tipos de cobranca."
      />
      <ClientsView
        mode={databaseReady ? "db" : "demo"}
        clients={clients}
        billingTypes={billingTypes}
        canManageClients={canManageClients}
        canViewFinancials={canViewFinancials}
        canManageBillingTypes={canManageBillingTypes}
        cnpjLookupAvailable={isCnpjLookupConfigured()}
        logoUploadAvailable={isStorageConfigured()}
      />
    </div>
  );
}
