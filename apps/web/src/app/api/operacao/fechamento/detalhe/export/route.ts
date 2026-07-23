import { requirePermission } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import {
  buildOperationDetailExportRows,
  operationDetailXlsxColumns,
} from "@/lib/operations/closing-detail-export";
import { noDatabaseResponse } from "../../../../relatorios/shared";

export const dynamic = "force-dynamic";

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = raw ? Number(raw) : fallback;
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback;
}

/**
 * `.xlsx` export of the "Detalhamento por consultor" tab of the Fechamento
 * Operacional. Same gate as the screen (`OPERACAO_FECHAMENTO` view) and reuses
 * `listOperationClosingDetail` for the selected month, honoring the consultant
 * filter (`consultant` param) so the file matches what is on screen. One row per
 * launch; no financial fields, so no masking. Audits
 * `OPERATION_CLOSING_EXPORTED`.
 */
export async function GET(request: Request) {
  const user = await requirePermission("OPERACAO_FECHAMENTO", "view");
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const url = new URL(request.url);
  const now = new Date();
  const month = clampInt(url.searchParams.get("m"), 1, 12, now.getMonth() + 1);
  const year = clampInt(url.searchParams.get("y"), 2020, 2100, now.getFullYear());
  const consultantId = url.searchParams.get("consultant") || undefined;

  const { listOperationClosingDetail } = await import(
    "@/lib/db/operation-closing"
  );
  const detail = await listOperationClosingDetail({ month, year, consultantId });
  const rows = buildOperationDetailExportRows(detail.rows);

  const monthSlug = `${year}-${String(month).padStart(2, "0")}`;
  const buffer = await buildWorkbook([
    defineSheet({
      name: `Detalhamento ${monthSlug}`,
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
    entityId: monthSlug,
    action: "OPERATION_CLOSING_EXPORTED",
    after: {
      view: "detalhamento",
      filter: { month, year, consultantId: consultantId ?? null },
      rowCount: rows.length,
    },
  });

  return xlsxResponse(buffer, `fechamento-detalhamento_${monthSlug}.xlsx`);
}
