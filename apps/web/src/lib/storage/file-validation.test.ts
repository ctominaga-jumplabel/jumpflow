import { describe, expect, it } from "vitest";
import {
  ACCEPTED_INVOICE_MIME_TYPES,
  MAX_INVOICE_SIZE_BYTES,
  MAX_RECEIPT_SIZE_BYTES,
  buildConsultantInvoiceKey,
  buildStorageKey,
  safeFileName,
  validateInvoiceFile,
  validateReceiptFile,
} from "./file-validation";

describe("validateReceiptFile", () => {
  const valid = { name: "nota.pdf", type: "application/pdf", size: 1024 };

  it("accepts the whitelisted types with coherent extensions", () => {
    expect(validateReceiptFile(valid)).toBeNull();
    expect(
      validateReceiptFile({ name: "foto.jpeg", type: "image/jpeg", size: 10 }),
    ).toBeNull();
    expect(
      validateReceiptFile({ name: "foto.jpg", type: "image/jpeg", size: 10 }),
    ).toBeNull();
    expect(
      validateReceiptFile({ name: "tela.png", type: "image/png", size: 10 }),
    ).toBeNull();
    expect(
      validateReceiptFile({ name: "tela.webp", type: "image/webp", size: 10 }),
    ).toBeNull();
  });

  it("rejects a MIME type outside the whitelist", () => {
    expect(
      validateReceiptFile({ name: "x.zip", type: "application/zip", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
    expect(
      validateReceiptFile({ name: "x.svg", type: "image/svg+xml", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
    expect(validateReceiptFile({ name: "x.pdf", type: "", size: 10 })).toMatchObject(
      { code: "INVALID_FILE" },
    );
  });

  it("rejects an extension outside the whitelist", () => {
    expect(
      validateReceiptFile({ name: "x.exe", type: "application/pdf", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
    expect(
      validateReceiptFile({ name: "sem-extensao", type: "image/png", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
  });

  it("rejects an extension incoherent with the MIME type", () => {
    expect(
      validateReceiptFile({ name: "nota.png", type: "application/pdf", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
    expect(
      validateReceiptFile({ name: "foto.pdf", type: "image/jpeg", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
  });

  it("rejects empty files and files over 10 MB", () => {
    expect(validateReceiptFile({ ...valid, size: 0 })).toMatchObject({
      code: "FILE_TOO_LARGE",
    });
    expect(
      validateReceiptFile({ ...valid, size: MAX_RECEIPT_SIZE_BYTES + 1 }),
    ).toMatchObject({ code: "FILE_TOO_LARGE" });
    // Exactly 10 MB is allowed.
    expect(
      validateReceiptFile({ ...valid, size: MAX_RECEIPT_SIZE_BYTES }),
    ).toBeNull();
  });
});

describe("validateInvoiceFile", () => {
  const valid = { name: "nf.pdf", type: "application/pdf", size: 1024 };

  it("exposes the expected NF MIME whitelist and 10 MB ceiling", () => {
    expect(MAX_INVOICE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(ACCEPTED_INVOICE_MIME_TYPES).toEqual([
      "application/pdf",
      "application/xml",
      "text/xml",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });

  it("accepts PDF, both XML MIME types and common images", () => {
    expect(validateInvoiceFile(valid)).toBeNull();
    expect(
      validateInvoiceFile({ name: "nf.xml", type: "application/xml", size: 10 }),
    ).toBeNull();
    expect(
      validateInvoiceFile({ name: "nf.xml", type: "text/xml", size: 10 }),
    ).toBeNull();
    expect(
      validateInvoiceFile({ name: "nf.jpg", type: "image/jpeg", size: 10 }),
    ).toBeNull();
    expect(
      validateInvoiceFile({ name: "nf.jpeg", type: "image/jpeg", size: 10 }),
    ).toBeNull();
    expect(
      validateInvoiceFile({ name: "nf.png", type: "image/png", size: 10 }),
    ).toBeNull();
    expect(
      validateInvoiceFile({ name: "nf.webp", type: "image/webp", size: 10 }),
    ).toBeNull();
  });

  it("rejects a MIME type outside the whitelist (incl. SVG scripts risk)", () => {
    expect(
      validateInvoiceFile({ name: "nf.svg", type: "image/svg+xml", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
    expect(
      validateInvoiceFile({ name: "nf.zip", type: "application/zip", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
    expect(
      validateInvoiceFile({ name: "nf.pdf", type: "", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
  });

  it("rejects an extension incoherent with the MIME type", () => {
    expect(
      validateInvoiceFile({ name: "nf.png", type: "application/pdf", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
    expect(
      validateInvoiceFile({ name: "nf.pdf", type: "text/xml", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
    expect(
      validateInvoiceFile({ name: "sem-extensao", type: "application/pdf", size: 10 }),
    ).toMatchObject({ code: "INVALID_FILE" });
  });

  it("rejects empty files and files over 10 MB; accepts exactly 10 MB", () => {
    expect(validateInvoiceFile({ ...valid, size: 0 })).toMatchObject({
      code: "FILE_TOO_LARGE",
    });
    expect(
      validateInvoiceFile({ ...valid, size: MAX_INVOICE_SIZE_BYTES + 1 }),
    ).toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(
      validateInvoiceFile({ ...valid, size: MAX_INVOICE_SIZE_BYTES }),
    ).toBeNull();
  });
});

describe("buildConsultantInvoiceKey", () => {
  const now = new Date("2026-06-10T14:30:45.123Z");

  it("builds consultant-invoices/{paymentId}/{timestamp}-{safeName}", () => {
    expect(buildConsultantInvoiceKey("cmpay123", "Nota Fiscal.pdf", now)).toBe(
      "consultant-invoices/cmpay123/2026-06-10T143045Z-nota-fiscal.pdf",
    );
  });

  it("carries no sensitive data (only payment id + sanitized name)", () => {
    const key = buildConsultantInvoiceKey(
      "cmpay123",
      "CNPJ 12.345.678-0001 Fulano.pdf",
      now,
    );
    expect(key.startsWith("consultant-invoices/cmpay123/")).toBe(true);
    expect(key.split("/")).toHaveLength(3);
    const [, , fileSegment] = key.split("/");
    expect(fileSegment).toMatch(/^[a-z0-9._\-TZ]+$/i);
  });
});

describe("safeFileName", () => {
  it("lowercases, strips accents and replaces spaces", () => {
    expect(safeFileName("Comprovante Café Açaí.PDF")).toBe(
      "comprovante-cafe-acai.pdf",
    );
  });

  it("removes non-ASCII characters entirely", () => {
    expect(safeFileName("nota-€£¥-端末.pdf")).toBe("nota--.pdf");
  });

  it("neutralizes path traversal and separators", () => {
    const result = safeFileName("../../etc/passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
    expect(safeFileName("..\\..\\windows\\system32")).not.toContain("\\");
  });

  it("keeps only [a-z0-9._-]", () => {
    expect(safeFileName("nota fiscal (1)!@#.pdf")).toMatch(/^[a-z0-9._-]+$/);
  });

  it("limits to 100 chars", () => {
    expect(safeFileName(`${"a".repeat(200)}.pdf`).length).toBeLessThanOrEqual(
      100,
    );
  });

  it("falls back to 'comprovante' when nothing survives", () => {
    expect(safeFileName("")).toBe("comprovante");
    expect(safeFileName("端末")).toBe("comprovante");
    expect(safeFileName("../..")).toBe("comprovante");
  });
});

describe("buildStorageKey", () => {
  const now = new Date("2026-06-10T14:30:45.123Z");

  it("builds expenses/{expenseId}/{timestamp}-{safeName}", () => {
    expect(buildStorageKey("cmexp123", "Nota Fiscal.pdf", now)).toBe(
      "expenses/cmexp123/2026-06-10T143045Z-nota-fiscal.pdf",
    );
  });

  it("contains only the expense id and sanitized name (no sensitive data)", () => {
    const key = buildStorageKey(
      "cmexp123",
      "CPF 123.456.789-00 João da Silva.pdf",
      now,
    );
    expect(key.startsWith("expenses/cmexp123/")).toBe(true);
    // The sanitized segment never carries path separators or non-ASCII.
    const [, , fileSegment] = key.split("/");
    expect(fileSegment).toMatch(/^[a-z0-9._\-TZ]+$/i);
    expect(key.split("/")).toHaveLength(3);
  });
});
