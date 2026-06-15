import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsultantPaymentsPanel } from "@/components/payments/ConsultantPaymentsPanel";
import { PaymentForecastPanel } from "@/components/payments/PaymentForecastPanel";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import type {
  ConsultantPaymentView,
  PaymentForecastView,
} from "@/lib/payments/types";

export const metadata: Metadata = { title: "Pagamentos" };

function parseMonth(value: string | string[] | undefined, fallback: number) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : fallback;
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12
    ? parsed
    : fallback;
}

function parseYear(value: string | string[] | undefined, fallback: number) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = raw ? Number(raw) : fallback;
  return Number.isInteger(parsed) && parsed >= 2020 && parsed <= 2100
    ? parsed
    : fallback;
}

export default async function PagamentosPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
} = {}) {
  await requireRole(FINANCIAL_ROLES);

  const databaseConfigured = isDatabaseConfigured();
  const now = new Date();
  const params = (await searchParams) ?? {};
  const month = parseMonth(params.month, now.getMonth() + 1);
  const year = parseYear(params.year, now.getFullYear());
  let payments: ConsultantPaymentView[] = [];
  let forecasts: PaymentForecastView[] = [];
  if (databaseConfigured) {
    const { listConsultantPayments, listPaymentForecasts } = await import(
      "@/lib/db/payments"
    );
    payments = await listConsultantPayments({ month, year });
    forecasts = await listPaymentForecasts({ month, year });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Pagamentos"
        description="Fluxo de pagamento de consultores, notas fiscais, envio ao banco e confirmacao."
      />
      <form className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface p-4">
        <label className="text-sm font-medium text-medium">
          Mes
          <input
            name="month"
            type="number"
            min={1}
            max={12}
            defaultValue={month}
            className="mt-1 h-10 w-24 rounded-md border border-border bg-surface px-3 text-sm text-strong"
          />
        </label>
        <label className="text-sm font-medium text-medium">
          Ano
          <input
            name="year"
            type="number"
            min={2020}
            max={2100}
            defaultValue={year}
            className="mt-1 h-10 w-28 rounded-md border border-border bg-surface px-3 text-sm text-strong"
          />
        </label>
        <button className="h-10 rounded-md bg-surface px-4 text-sm font-semibold text-strong shadow-[2px_2px_0_0_var(--color-ink)]">
          Filtrar
        </button>
      </form>
      <PaymentForecastPanel
        mode={databaseConfigured ? "db" : "demo"}
        month={month}
        year={year}
        forecasts={forecasts}
      />
      <ConsultantPaymentsPanel
        mode={databaseConfigured ? "db" : "demo"}
        month={month}
        year={year}
        payments={payments}
      />
    </div>
  );
}
