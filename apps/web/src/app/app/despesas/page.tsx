import type { Metadata } from "next";
import { UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExpensesView } from "@/components/expenses/ExpensesView";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isStorageConfigured } from "@/lib/storage/provider";

export const metadata: Metadata = { title: "Despesas" };

/**
 * Despesas: expense tracking along the single status chain (draft → manager →
 * finance → payment). With a database, data comes from Prisma and mutations go
 * through server actions. Without one, the original demo (local state) keeps
 * the screen usable, with an explicit banner.
 */
export default async function DespesasPage() {
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  const header = (
    <PageHeader
      eyebrow="Operação"
      title="Despesas"
      description="Lançamento de despesas por projeto, com comprovante, aprovação em duas etapas e acompanhamento de pagamento."
    />
  );

  if (!isDatabaseConfigured()) {
    return (
      <div className="space-y-6">
        {header}
        <ExpensesView mode="demo" consultantName={user.name} today={today} />
      </div>
    );
  }

  // Lazy import so Prisma is never loaded on code paths without a database.
  const { getConsultantForUser } = await import("@/lib/db/timesheet");
  const { listExpensesForConsultant, listExpenseProjects } = await import(
    "@/lib/db/expenses"
  );

  const consultant = await getConsultantForUser(user);
  if (!consultant) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={UserX}
          title="Sem vínculo de consultor"
          description="Seu usuário não está vinculado a um consultor. Contate um administrador."
        />
      </div>
    );
  }

  const [expenses, projects] = await Promise.all([
    listExpensesForConsultant(consultant.id),
    listExpenseProjects(consultant.id),
  ]);

  return (
    <div className="space-y-6">
      {header}
      <ExpensesView
        mode="db"
        consultantName={consultant.name}
        today={today}
        expenses={expenses}
        projects={projects}
        storageAvailable={isStorageConfigured()}
      />
    </div>
  );
}
