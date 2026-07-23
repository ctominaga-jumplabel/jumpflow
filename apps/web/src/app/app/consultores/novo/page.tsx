import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewConsultantForm } from "@/components/consultants/NewConsultantForm";
import { getCurrentUser } from "@/lib/auth/current-user";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import type { RoleName } from "@/lib/auth/types";

export const metadata: Metadata = { title: "Novo consultor" };

const CREATE_CONSULTANT_ROLES: RoleName[] = ["ADMIN", "PEOPLE"];

/**
 * Formulario completo de criacao de consultor. Rota protegida no servidor:
 * apenas ADMIN/PEOPLE criam consultores (mesma regra da server action). A secao
 * financeira (remuneracao) so aparece para papeis financeiros e a criacao do
 * perfil ADMIN so e oferecida a administradores.
 */
export default async function NovoConsultorPage() {
  const user = await getCurrentUser();
  if (!hasRole(user, CREATE_CONSULTANT_ROLES)) {
    redirect("/app/consultores");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Novo consultor"
        description="Cadastre a identidade, o acesso e os dados principais. Você poderá completar o restante no perfil depois de criar."
      />
      <NewConsultantForm
        canManageFinancials={hasRole(user, FINANCIAL_ROLES)}
        canGrantAdmin={hasRole(user, ["ADMIN"])}
      />
    </div>
  );
}
