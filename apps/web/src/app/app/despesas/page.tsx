import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText, UserX } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExpensesView } from "@/components/expenses/ExpensesView";
import { ExpenseApprovalsSection } from "@/components/expenses/ExpenseApprovalsSection";
import { requireUser } from "@/lib/auth/guards";
import {
  REIMBURSEMENT_POLICY_ROLES,
  hasRole,
} from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isStorageConfigured } from "@/lib/storage/provider";
import type { ApprovalItem } from "@/lib/mock-data/approvals";

export const metadata: Metadata = { title: "Despesas" };

/**
 * Despesas: expense tracking along the single status chain (draft → manager →
 * finance → payment). With a database, data comes from Prisma and mutations go
 * through server actions. Without one, the original demo (local state) keeps
 * the screen usable, with an explicit banner.
 *
 * Onda 3: papéis de gestão veem também as filas de aprovação (operacional e
 * financeira) das despesas na própria tela (P14), reusando as mesmas actions da
 * fila /app/aprovacoes, e um atalho para a Política de Reembolso (P12).
 */
export default async function DespesasPage() {
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const canManagePolicy = hasRole(user, REIMBURSEMENT_POLICY_ROLES);

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <PageHeader
        eyebrow="Operação"
        title="Despesas"
        description="Lançamento de despesas por projeto, com comprovante, aprovação em duas etapas e acompanhamento de pagamento."
      />
      {canManagePolicy ? (
        <Link
          href="/app/despesas/politica"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-medium hover:bg-surface-muted"
        >
          <ScrollText aria-hidden="true" className="size-4" />
          Política de Reembolso
        </Link>
      ) : null}
    </div>
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
  const { listExpensesForConsultant, listExpenseProjects, listExpenseApprovalItems } =
    await import("@/lib/db/expenses");
  const { resolveDbUser } = await import("@/lib/db/users");
  const { getActivePolicyRules } = await import(
    "@/lib/db/reimbursement-policy"
  );
  const { listExpenseTypeOptions } = await import("@/lib/db/expense-types");

  const consultant = await getConsultantForUser(user);
  const [policyRules, expenseTypes] = await Promise.all([
    getActivePolicyRules(),
    listExpenseTypeOptions(),
  ]);

  // P14: aprovação operacional/financeira das despesas na própria tela.
  const unrestricted = hasRole(user, ["ADMIN", "AREA_MANAGER"]);
  const isProjectManager = hasRole(user, "PROJECT_MANAGER");
  const isFinance = hasRole(user, "FINANCE");
  const canApprove = unrestricted || isProjectManager || isFinance;

  let approvalItems: ApprovalItem[] = [];
  if (canApprove) {
    let managerUserId: string | undefined;
    if (!unrestricted && isProjectManager) {
      const dbUser = await resolveDbUser(user);
      managerUserId = dbUser?.id ?? "__no-manager__";
    }
    const items = await listExpenseApprovalItems({
      includeManagerStage: unrestricted || isProjectManager,
      includeFinanceStage: unrestricted || isFinance,
      managerUserId,
    });
    // Somente pendências entram no painel embutido (histórico fica em /app/aprovacoes).
    approvalItems = items.filter((item) => item.status === "PENDING");
  }

  const approvalsBlock = canApprove ? (
    <ExpenseApprovalsSection items={approvalItems} />
  ) : null;

  if (!consultant) {
    return (
      <div className="space-y-6">
        {header}
        {approvalsBlock ?? (
          <EmptyState
            icon={UserX}
            title="Sem vínculo de consultor"
            description="Seu usuário não está vinculado a um consultor. Contate um administrador."
          />
        )}
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
      {approvalsBlock}
      <ExpensesView
        mode="db"
        consultantName={consultant.name}
        today={today}
        expenses={expenses}
        projects={projects}
        storageAvailable={isStorageConfigured()}
        policyRules={policyRules}
        expenseTypes={expenseTypes}
      />
    </div>
  );
}
