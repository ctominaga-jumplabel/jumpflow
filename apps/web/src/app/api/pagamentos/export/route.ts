import { requireRole } from "@/lib/auth/guards";
import { FINANCIAL_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import {
  buildPaymentExportRows,
  type PaymentExportRow,
} from "@/lib/payments/payment-export";
import { consultantPaymentStatusLabels } from "@/lib/payments/types";
import type { ConsultantPaymentStatus } from "@/lib/payments/state-machine";
import {
  invalidInputResponse,
  noDatabaseResponse,
} from "../../relatorios/shared";

export const dynamic = "force-dynamic";

const CONTRACT_TYPES = ["PJ", "CLT_FLEX"] as const;
type ExportContractType = (typeof CONTRACT_TYPES)[number];

function parseInt1(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

/**
 * Excel do fluxo de Pagamentos (P19). Dado altamente sensível (CNPJ/CPF/PIX/
 * valor): re-checa FINANCIAL_ROLES no servidor, reaplica o MESMO filtro da tela
 * (só PJ/CLT_FLEX) e AUDITA o download (CONSULTANT_PAYMENTS_EXPORTED) com o
 * filtro usado. Colunas: "CNPJ ou CPF", "Valor", "Projeto", "Chave PIX".
 */
export async function GET(request: Request) {
  const user = await requireRole(FINANCIAL_ROLES);
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const url = new URL(request.url);
  const month = parseInt1(url.searchParams.get("month"));
  const year = parseInt1(url.searchParams.get("year"));
  if (!month || month < 1 || month > 12) return invalidInputResponse();
  if (!year || year < 2020 || year > 2100) return invalidInputResponse();

  const consultantId = url.searchParams.get("consultantId") || undefined;
  const statusRaw = url.searchParams.get("status") || undefined;
  const status =
    statusRaw && statusRaw in consultantPaymentStatusLabels
      ? (statusRaw as ConsultantPaymentStatus)
      : undefined;
  const contractTypeRaw = url.searchParams.get("contractType") || undefined;
  const contractType =
    contractTypeRaw &&
    (CONTRACT_TYPES as readonly string[]).includes(contractTypeRaw)
      ? (contractTypeRaw as ExportContractType)
      : undefined;

  const { listConsultantPaymentsForExport } = await import("@/lib/db/payments");
  const consultants = await listConsultantPaymentsForExport({
    month,
    year,
    consultantId,
    status,
    contractType,
  });
  const rows = buildPaymentExportRows(consultants);

  const monthSlug = `${year}-${String(month).padStart(2, "0")}`;
  const sheet = defineSheet<PaymentExportRow>({
    name: `Pagamentos ${monthSlug}`,
    columns: [
      { header: "CNPJ ou CPF", value: (row) => row.documentNumber, width: 22 },
      { header: "Valor", value: (row) => row.amount, numFmt: "#,##0.00", width: 14 },
      { header: "Projeto", value: (row) => row.projectName, width: 30 },
      { header: "Chave PIX", value: (row) => row.pixKey, width: 30 },
    ],
    rows,
  });
  const buffer = await buildWorkbook([sheet]);

  // Auditar o download do dado financeiro sensível com o filtro exato usado.
  const { resolveDbUser } = await import("@/lib/db/users");
  const { recordAuditEvent } = await import("@/lib/db/audit");
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "ConsultantPayment",
    entityId: monthSlug,
    action: "CONSULTANT_PAYMENTS_EXPORTED",
    after: {
      filter: {
        month,
        year,
        consultantId: consultantId ?? null,
        status: status ?? null,
        contractType: contractType ?? null,
      },
      consultantCount: consultants.length,
      rowCount: rows.length,
    },
  });

  return xlsxResponse(buffer, `pagamentos_${monthSlug}.xlsx`);
}
