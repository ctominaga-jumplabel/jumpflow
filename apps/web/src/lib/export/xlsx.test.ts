import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildWorkbook, defineSheet, xlsxResponse } from "./xlsx";

interface Row {
  name: string;
  amount: number;
  when: Date;
  note: string | null;
}

async function readBack(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // exceljs' bundled Node types predate the generic Buffer<TArrayBuffer>, so
  // cast the buffer to the shape its `.load` overload expects.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

describe("buildWorkbook", () => {
  const rows: Row[] = [
    { name: "Ana", amount: 1200.5, when: new Date("2026-07-01"), note: "ok" },
    { name: "Bruno", amount: 0, when: new Date("2026-07-02"), note: null },
  ];

  const sheet = defineSheet<Row>({
    name: "Pagamentos",
    columns: [
      { header: "Consultor", value: (r) => r.name },
      { header: "Valor", value: (r) => r.amount, numFmt: "#,##0.00" },
      { header: "Data", value: (r) => r.when },
      { header: "Obs", value: (r) => r.note },
    ],
    rows,
  });

  it("writes a real xlsx (zip) buffer", async () => {
    const buffer = await buildWorkbook([sheet]);
    // .xlsx is a ZIP archive → starts with the PK magic bytes.
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it("round-trips header and cell values", async () => {
    const wb = await readBack(await buildWorkbook([sheet]));
    const ws = wb.getWorksheet("Pagamentos");
    expect(ws).toBeDefined();
    expect(ws!.getRow(1).getCell(1).value).toBe("Consultor");
    expect(ws!.getRow(2).getCell(1).value).toBe("Ana");
    expect(ws!.getRow(2).getCell(2).value).toBe(1200.5);
    // Empty note serialized as null → blank cell.
    expect(ws!.getRow(3).getCell(4).value).toBeNull();
  });

  it("neutralizes formula-injection in free-text cells", async () => {
    const evil = defineSheet<{ v: string }>({
      name: "x",
      columns: [{ header: "V", value: (r) => r.v }],
      rows: [{ v: "=cmd|' /c calc'!A1" }],
    });
    const wb = await readBack(await buildWorkbook([evil]));
    const cell = wb.getWorksheet("x")!.getRow(2).getCell(1).value;
    expect(String(cell).startsWith("'=")).toBe(true);
  });

  it("truncates and cleans invalid sheet names", async () => {
    const long = defineSheet<{ v: string }>({
      name: "Contas:a*Receber/[2026]—um nome bem grande demais",
      columns: [{ header: "V", value: (r) => r.v }],
      rows: [{ v: "a" }],
    });
    const wb = await readBack(await buildWorkbook([long]));
    const ws = wb.worksheets[0];
    expect(ws.name.length).toBeLessThanOrEqual(31);
    expect(ws.name).not.toMatch(/[[\]:*?/\\]/);
  });
});

describe("xlsxResponse", () => {
  it("sets the spreadsheet content type and attachment filename", () => {
    const res = xlsxResponse(Buffer.from([0x50, 0x4b]), "teste.xlsx");
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(res.headers.get("Content-Disposition")).toContain("teste.xlsx");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });
});
