import { requirePermission } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import { hoursReportFilterSchema } from "@/lib/reports/schemas";
import {
  buildOperationDetailExportRows,
  operationDetailXlsxColumns,
} from "@/lib/operations/closing-detail-export";
import { noDatabaseResponse } from "../../../../relatorios/shared";

export const dynamic = "force-dynamic";

/**
 * `.xlsx` export of the "Detalhamento por consultor" tab of the Fechamento
 * Operacional. Same gate as the screen (`OPERACAO_FECHAMENTO` view) and reuses
 * `listOperationDetailRows` with the SAME filter contract as the screen (the
 * `hoursReportFilterSchema` — período, cliente, projeto, consultor, status,
 * atividade, faturável, status de cliente/projeto/consultor, ordenação). No
 * pagination: the file carries every matching launch. No financial fields, so
 * no masking. Audits `OPERATION_CLOSING_EXPORTED`.
 */
export async function GET(request: Request) {
  const user = await requirePermission("OPERACAO_FECHAMENTO", "view");
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) raw[key] = value;
  // page/pageSize never bound the export — it always covers the whole set.
  delete raw.page;
  delete raw.pageSize;
  const parsed = hoursReportFilterSchema.safeParse(raw);
  const filter = parsed.success ? parsed.data : {};

  const { listOperationDetailRows } = await import(
    "@/lib/db/operation-closing"
  );
  const detailRows = await listOperationDetailRows(filter);
  const rows = buildOperationDetailExportRows(detailRows);

  const slug = new Date().toISOString().slice(0, 10);
  const buffer = await buildWorkbook([
    defineSheet({
      name: "Detalhamento",
      columns: operationDetailXlsxColumns(),
      rows,
    }),
  ]);

  const { resolveDbUser } = await import("@/lib/db/users");
  const { recordAuditEvent } = await import("@/lib/db/audit");
  const dbUser = await resolveDbUser(user);
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "OperationClosing",
    entityId: slug,
    action: "OPERATION_CLOSING_EXPORTED",
    after: {
      view: "detalhamento",
      filter: raw,
      rowCount: rows.length,
    },
  });

  return xlsxResponse(buffer, `fechamento-detalhamento_${slug}.xlsx`);
}
