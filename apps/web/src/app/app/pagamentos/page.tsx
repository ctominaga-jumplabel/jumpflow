import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConsultantPaymentsPanel } from "@/components/payments/ConsultantPaymentsPanel";
import { PaymentForecastPanel } from "@/components/payments/PaymentForecastPanel";
import { requireRole } from "@/lib/auth/guards";
import { FLOW_PERMISSION_CODES } from "@/lib/auth/permission-codes";
import { canEach } from "@/lib/auth/permissions";
import { canAccessSensitiveCost } from "@/lib/auth/sensitive-data";
import {
  FINANCIAL_ROLES,
  PAYMENTS_ROUTE_ROLES,
  hasRole,
} from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { ConsultantPaymentStatus } from "@/lib/payments/state-machine";
import {
  consultantPaymentStatusLabels,
  type ConsultantPaymentView,
  type PaymentForecastView,
} from "@/lib/payments/types";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

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
  // Governança Fluxo de Horas: o DP (PEOPLE) também entra — para LIBERAR os
  // pagamentos. As ações financeiras (banco, aprovar, pago, previsão, NF,
  // export com dados bancários) seguem só para FINANCIAL_ROLES.
  const user = await requireRole(PAYMENTS_ROUTE_ROLES);
  const canOperateFinance = hasRole(user, FINANCIAL_ROLES);
  // Etapas do fluxo pela Matriz (calculadas no servidor; o gate real é nas
  // server actions): liberar (DP), enviar solicitação de NF e reabrir
  // liberação (Financeiro).
  const flowGrants = await canEach(
    [
      FLOW_PERMISSION_CODES.paymentPeopleRelease,
      FLOW_PERMISSION_CODES.paymentInvoiceRequest,
      FLOW_PERMISSION_CODES.paymentReopenRelease,
    ],
    "edit",
  );
  const flowPermissions = {
    canPeopleRelease: flowGrants[FLOW_PERMISSION_CODES.paymentPeopleRelease],
    canRequestInvoice: flowGrants[FLOW_PERMISSION_CODES.paymentInvoiceRequest],
    canReopenRelease: flowGrants[FLOW_PERMISSION_CODES.paymentReopenRelease],
    canOperateFinance,
  };

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
  let exceptionsByPayment:
    | Record<string, import("@/lib/timesheet/entry-exceptions").EntryExceptionSummary>
    | undefined;
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
        // Valor/hora de cada linha é o custo do consultor: só Dados Sensíveis.
        includeUnitRate: canAccessSensitiveCost(user),
      }),
      canOperateFinance
        ? listPaymentForecasts({ month, year })
        : Promise.resolve([] as PaymentForecastView[]),
      listPaymentConsultants(),
    ]);
    // Sinal para o DP: exceções (fim de semana/feriado/atividade) dos
    // lançamentos de cada pagamento — leitura em lote, não por linha.
    const { loadPaymentEntryExceptions } = await import(
      "@/lib/db/entry-exceptions"
    );
    exceptionsByPayment = await loadPaymentEntryExceptions(
      payments.map((p) => p.id),
    );
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
        description="Fluxo de pagamento de consultores: liberacao do DP, notas fiscais, envio ao banco e confirmacao."
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
          <SearchableSelect
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
          </SearchableSelect>
        </label>
        <label className="text-sm font-medium text-medium">
          Status
          <SearchableSelect
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
          </SearchableSelect>
        </label>
        <label className="text-sm font-medium text-medium">
          Contratacao
          <SearchableSelect
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
          </SearchableSelect>
        </label>
        <button className="h-10 rounded-md bg-surface px-4 text-sm font-semibold text-strong shadow-[2px_2px_0_0_var(--color-ink)]">
          Filtrar
        </button>
      </form>
      {canOperateFinance ? (
        <PaymentForecastPanel
          mode={databaseConfigured ? "db" : "demo"}
          month={month}
          year={year}
          forecasts={forecasts}
        />
      ) : null}
      <ConsultantPaymentsPanel
        mode={databaseConfigured ? "db" : "demo"}
        month={month}
        year={year}
        payments={payments}
        exportHref={canOperateFinance ? exportHref : undefined}
        exceptionsByPayment={exceptionsByPayment}
        permissions={flowPermissions}
      />
    </div>
  );
}
