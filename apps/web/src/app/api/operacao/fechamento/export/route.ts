import { requirePermission } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { buildWorkbook, defineSheet, xlsxResponse } from "@/lib/export/xlsx";
import {
  buildOperationClosingExportRows,
  operationClosingXlsxColumns,
} from "@/lib/operations/closing-export";
import { noDatabaseResponse } from "../../../relatorios/shared";

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
 * `.xlsx` export of the Fechamento Operacional (Onda 6). Gated by the SAME
 * permission as the screen (`OPERACAO_FECHAMENTO` view) and reuses
 * `listOperationClosings` for the selected month (m/y params). The overview is
 * flattened to one row per allocated consultant (the DP follow-up view). No
 * financial fields, so no masking. Audits `OPERATION_CLOSING_EXPORTED`.
 */
export async function GET(request: Request) {
  const user = await requirePermission("OPERACAO_FECHAMENTO", "view");
  if (!isDatabaseConfigured()) return noDatabaseResponse();

  const url = new URL(request.url);
  const now = new Date();
  const month = clampInt(url.searchParams.get("m"), 1, 12, now.getMonth() + 1);
  const year = clampInt(url.searchParams.get("y"), 2020, 2100, now.getFullYear());

  const { listOperationClosings } = await import("@/lib/db/operation-closing");
  const overview = await listOperationClosings({ month, year });
  const rows = buildOperationClosingExportRows(overview);

  const monthSlug = `${year}-${String(month).padStart(2, "0")}`;
  const buffer = await buildWorkbook([
    defineSheet({
      name: `Fechamento ${monthSlug}`,
      columns: operationClosingXlsxColumns(),
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
    after: { filter: { month, year }, rowCount: rows.length },
  });

  return xlsxResponse(buffer, `fechamento-operacional_${monthSlug}.xlsx`);
}
