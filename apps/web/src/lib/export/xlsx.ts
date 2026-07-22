import ExcelJS from "exceljs";

import { sanitizeText } from "@/lib/reports/csv";

/**
 * Reusable `.xlsx` workbook builder shared by every "Exportar Excel" button
 * (Contas a Pagar/Receber, Horas, Aprovacoes, Fechamento Operacional, Despesas,
 * Pagamentos). Mirrors the CSV builder contract in `lib/reports/csv.ts`:
 *
 * - RBAC and filtering are the CALLER's job — this module only serializes the
 *   rows it is handed. Never call it with data the current user cannot see.
 * - Free-text cells are run through `sanitizeText` (anti CSV/formula injection)
 *   exactly like the CSV path, so a cell starting with `=`/`+`/`-`/`@` stays
 *   inert when the file is reopened in a spreadsheet tool.
 */

export type XlsxCellValue = string | number | Date | null | undefined;

export interface XlsxColumn<T> {
  header: string;
  value: (row: T) => XlsxCellValue;
  /** Excel number format applied to the data cells (e.g. "#,##0.00"). */
  numFmt?: string;
  /** Column width in characters; defaults to fit the header. */
  width?: number;
}

export interface XlsxSheetSpec {
  name: string;
  build: (ws: ExcelJS.Worksheet) => void;
}

/** Excel sheet-name rules: max 31 chars, none of `[]:*?/\`. */
function sanitizeSheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").trim();
  return cleaned.slice(0, 31) || "Planilha";
}

function normalize(value: XlsxCellValue): string | number | Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") return sanitizeText(value);
  return value;
}

/**
 * Bind a typed row set + column definitions into a sheet spec. Kept generic so
 * a single workbook can carry heterogeneous sheets (e.g. resumo + detalhe).
 */
export function defineSheet<T>(spec: {
  name: string;
  columns: ReadonlyArray<XlsxColumn<T>>;
  rows: ReadonlyArray<T>;
}): XlsxSheetSpec {
  return {
    name: sanitizeSheetName(spec.name),
    build(ws) {
      ws.columns = spec.columns.map((column) => ({
        header: column.header,
        width: column.width ?? Math.max(12, column.header.length + 2),
        style: column.numFmt ? { numFmt: column.numFmt } : {},
      }));
      const header = ws.getRow(1);
      header.font = { bold: true };
      header.alignment = { vertical: "middle" };
      for (const row of spec.rows) {
        ws.addRow(spec.columns.map((column) => normalize(column.value(row))));
      }
      ws.views = [{ state: "frozen", ySplit: 1 }];
    },
  };
}

/** Serialize the given sheets into a `.xlsx` byte buffer. */
export async function buildWorkbook(
  sheets: ReadonlyArray<XlsxSheetSpec>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JumpFlow";
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.build(ws);
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** An `.xlsx` attachment response with no caching (mirrors `csvResponse`). */
export function xlsxResponse(buffer: Buffer, filename: string): Response {
  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
