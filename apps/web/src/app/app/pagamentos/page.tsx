import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsultantPaymentsPanel } from "@/components/payments/ConsultantPaymentsPanel";
import { PaymentForecastPanel } from "@/components/payments/PaymentForecastPanel";
import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { ConsultantPaymentStatus } from "@/lib/payments/state-machine";
import {
  consultantPaymentStatusLabels,
  type ConsultantPaymentView,
  type PaymentForecastView,
} from "@/lib/payments/types";

export const metadata: Metadata = { title: "Pagamentos" };

// P18: o fluxo de Pagamentos cobre SOMENTE PJ e CLT_FLEX. CLT puro é folha
// (jump-hr-compensation-agent) e sai deste fluxo — não é listado nem filtrável.
const CONTRACT_TYPES = ["PJ", "CLT_FLEX"] as const;
type ContractType = (typeof CONTRACT_TYPES)[number];

const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  PJ: "PJ",
  CLT_FLEX: "CLT Flex",
};

const PAYMENT_STATUSES = Object.keys(
  consultantPaymentStatusLabels,
) as ConsultantPaymentStatus[];

function parseSingle(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && raw.length > 0 ? raw : undefined;
}

function parseStatus(
  value: string | string[] | undefined,
): ConsultantPaymentStatus | undefined {
  const raw = parseSingle(value);
  return raw && raw in consultantPaymentStatusLabels
    ? (raw as ConsultantPaymentStatus)
    : undefined;
}

function parseContractType(
  value: string | string[] | undefined,
): ContractType | undefined {
  const raw = parseSingle(value);
  return raw && (CONTRACT_TYPES as readonly string[]).includes(raw)
    ? (raw as ContractType)
    : undefined;
}

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
  const consultantId = parseSingle(params.consultantId);
  const status = parseStatus(params.status);
  const contractType = parseContractType(params.contractType);
  let payments: ConsultantPaymentView[] = [];
  let forecasts: PaymentForecastView[] = [];
  let consultants: { id: string; name: string }[] = [];
  if (databaseConfigured) {
    const {
      listConsultantPayments,
      listPaymentForecasts,
      listPaymentConsultants,
    } = await import("@/lib/db/payments");
    [payments, forecasts, consultants] = await Promise.all([
      listConsultantPayments({
        month,
        year,
        consultantId,
        status,
        contractType,
      }),
      listPaymentForecasts({ month, year }),
      listPaymentConsultants(),
    ]);
  }

  // Export href reflete exatamente o filtro aplicado (mês/ano/contratação/
  // consultor/status). A rota re-checa RBAC e reaplica o mesmo `where`.
  const exportQuery = new URLSearchParams();
  exportQuery.set("month", String(month));
  exportQuery.set("year", String(year));
  if (consultantId) exportQuery.set("consultantId", consultantId);
  if (status) exportQuery.set("status", status);
  if (contractType) exportQuery.set("contractType", contractType);
  const exportHref = `/api/pagamentos/export?${exportQuery.toString()}`;

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
        <label className="text-sm font-medium text-medium">
          Consultor
          <select
            name="consultantId"
            defaultValue={consultantId ?? ""}
            className="mt-1 h-10 w-48 rounded-md border border-border bg-surface px-3 text-sm text-strong"
          >
            <option value="">Todos</option>
            {consultants.map((consultant) => (
              <option key={consultant.id} value={consultant.id}>
                {consultant.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-medium">
          Status
          <select
            name="status"
            defaultValue={status ?? ""}
            className="mt-1 h-10 w-48 rounded-md border border-border bg-surface px-3 text-sm text-strong"
          >
            <option value="">Todos</option>
            {PAYMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {consultantPaymentStatusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-medium">
          Contratacao
          <select
            name="contractType"
            defaultValue={contractType ?? ""}
            className="mt-1 h-10 w-40 rounded-md border border-border bg-surface px-3 text-sm text-strong"
          >
            <option value="">Todas</option>
            {CONTRACT_TYPES.map((value) => (
              <option key={value} value={value}>
                {CONTRACT_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
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
        exportHref={exportHref}
      />
    </div>
  );
}
