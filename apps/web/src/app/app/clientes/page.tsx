import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ClientsView } from "@/components/clients/ClientsView";
import { requireRole } from "@/lib/auth/guards";
import { SUBSCREEN_CODES } from "@/lib/auth/permission-codes";
import { canEach } from "@/lib/auth/permissions";
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
  // Subtela "Tipos de cobrança": a matriz precisa conceder `view` no codigo
  // dela; a aba "Clientes" segue governada pelo codigo da propria tela.
  const subscreens = await canEach([SUBSCREEN_CODES.clients.billingTypes]);
  const canViewBillingTypes = subscreens[SUBSCREEN_CODES.clients.billingTypes];
  const canManageBillingTypes =
    canViewBillingTypes && hasRole(user, FINANCIAL_ROLES);
  // Os tipos so sao carregados quando a aba e permitida ou quando o select de
  // cobranca do formulario de cliente (campo financeiro) precisa deles.
  const loadBillingTypes = canViewBillingTypes || canViewFinancials;
  const [clients, billingTypes] = databaseReady
    ? await Promise.all([
        listClients({ includeFinancials: canViewFinancials }),
        loadBillingTypes ? listBillingTypes() : Promise.resolve([]),
      ])
    : [undefined, undefined];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Comercial e financeiro"
        title="Clientes"
        description="Cadastro de clientes, CNPJ, regras fiscais e tipos de cobrança."
      />
      <ClientsView
        mode={databaseReady ? "db" : "demo"}
        clients={clients}
        billingTypes={billingTypes}
        canManageClients={canManageClients}
        canViewFinancials={canViewFinancials}
        canManageBillingTypes={canManageBillingTypes}
        canViewBillingTypes={canViewBillingTypes}
        cnpjLookupAvailable={isCnpjLookupConfigured()}
        logoUploadAvailable={isStorageConfigured()}
      />
    </div>
  );
}
