import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { MyInvoicesPanel } from "@/components/payments/MyInvoicesPanel";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { ConsultantPaymentView } from "@/lib/payments/types";

export const metadata: Metadata = { title: "Minhas notas fiscais" };

/**
 * Consultant self-service NF screen (melhoria #3). Any authenticated identity
 * may open it, but the read is SCOPED to the logged-in user's own consultant
 * (`listOwnConsultantPayments`) — a consultant can never see another's payment
 * or NF. CLT puro is out of the NF flow (only PJ/CLT_FLEX are returned).
 */
export default async function MinhasNotasPage() {
  const user = await requireUser();

  let payments: ConsultantPaymentView[] = [];
  if (isDatabaseConfigured()) {
    const { listOwnConsultantPayments } = await import("@/lib/db/payments");
    const { resolveDbUser } = await import("@/lib/db/users");
    // Use the REAL User id (dev-auth ids are synthetic; fall back to email).
    const dbUser = await resolveDbUser(user);
    payments = await listOwnConsultantPayments({
      userId: dbUser?.id ?? user.id,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Minhas notas fiscais"
        description="Acompanhe seus pagamentos por competência e anexe a nota fiscal dos meses em aberto."
      />
      <MyInvoicesPanel payments={payments} />
    </div>
  );
}
