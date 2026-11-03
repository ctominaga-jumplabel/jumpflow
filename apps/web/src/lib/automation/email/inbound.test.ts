import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    inbound: [] as Array<Record<string, unknown>>,
    attachments: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>,
    paymentStatus: "WAITING_FOR_INVOICE",
    uploads: [] as string[],
    forwardTo: ["fin@jump.test"] as string[],
  };
  const tx = {
    consultantInvoiceAttachment: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `att${state.attachments.length + 1}`, ...data };
        state.attachments.push(row);
        return row;
      },
    },
    consultantPayment: {
      updateMany: async ({ where, data }: { where: { status: { in: string[] } }; data: { status?: string } }) => {
        if (!where.status.in.includes(state.paymentStatus)) return { count: 0 };
        if (data.status) state.paymentStatus = data.status;
        return { count: 1 };
      },
    },
    auditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => state.audits.push(data) },
  };
  const prisma = {
    inboundEmail: {
      findUnique: async ({ where }: { where: { resendEmailId: string } }) =>
        state.inbound.find((r) => r.resendEmailId === where.resendEmailId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `in${state.inbound.length + 1}`, createdAt: new Date("2026-11-11T15:00:00.000Z"), ...data };
        state.inbound.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = state.inbound.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
    },
    outboundEmailThread: {
      findUnique: async ({ where }: { where: { token: string } }) =>
        where.token === "abcdefghijklmnopqrstuvwx"
          ? {
              id: "t1",
              token: where.token,
              event: "CONSULTANT_INVOICE_REQUEST",
              referenceType: "ConsultantPayment",
              referenceId: "pay1",
              subject: "Envie sua NF — 10/2026",
            }
          : null,
    },
    consultantPayment: {
      findUnique: async () => ({
        id: "pay1",
        status: state.paymentStatus,
        contractType: "PJ",
        consultant: { email: "ana@pj.test" },
      }),
    },
    consultantInvoiceAttachment: {
      count: async ({ where }: { where: { inboundEmailId: string } }) =>
        state.attachments.filter((a) => a.inboundEmailId === where.inboundEmailId).length,
    },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { state, prisma };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prisma,
  Prisma: { PrismaClientKnownRequestError: class extends Error {} },
}));
vi.mock("@/lib/storage/provider", () => ({
  CONSULTANT_INVOICES_BUCKET: "consultant-invoices",
  getConsultantInvoiceStorageProvider: () => ({
    upload: async (key: string) => {
      h.state.uploads.push(key);
    },
    delete: async () => undefined,
  }),
}));
vi.mock("./reply-routing", () => ({
  inboundDomain: () => "in.flow.test",
  replyForwardEmails: async () => h.state.forwardTo,
}));

import { isInlinePart, normalizeAttachmentType, processInboundEmail, selectInvoiceFiles } from "./inbound";

const pdf = new Uint8Array([37, 80, 68, 70]);
const png = new Uint8Array([137, 80, 78, 71]);

function deps(sent: Array<Record<string, unknown>>) {
  return {
    getReceivedEmail: async (id: string) => ({
      id,
      from: "Ana PJ <ana@pj.test>",
      to: ["respostas+abcdefghijklmnopqrstuvwx@in.flow.test"],
      subject: "Re: Envie sua NF",
      html: "<p>Segue a NF</p>",
      text: "Segue a NF",
      created_at: "2026-11-11T15:00:00.000Z",
      attachments: [
        { id: "a1", filename: "nf-outubro.pdf", content_type: "application/octet-stream", content_disposition: "attachment" },
        { id: "a2", filename: "logo.png", content_type: "image/png", content_disposition: "inline", content_id: "logo" },
      ],
    }),
    listReceivedAttachments: async () => [
      { id: "a1", filename: "nf-outubro.pdf", content_type: "application/octet-stream", content_disposition: "attachment", size: 4, download_url: "https://cdn/a1" },
      { id: "a2", filename: "logo.png", content_type: "image/png", content_disposition: "inline", content_id: "logo", size: 4, download_url: "https://cdn/a2" },
    ],
    downloadReceivedAttachment: async (url: string) => (url.endsWith("a1") ? pdf : png),
    transport: {
      send: async (message: Record<string, unknown>) => {
        sent.push(message);
        return { id: "fwd1", provider: "test" };
      },
    },
  };
}

beforeEach(() => {
  h.state.inbound = [];
  h.state.attachments = [];
  h.state.audits = [];
  h.state.uploads = [];
  h.state.paymentStatus = "WAITING_FOR_INVOICE";
  h.state.forwardTo = ["fin@jump.test"];
});

describe("helpers de anexo", () => {
  it("deduz o tipo pela extensão quando vem octet-stream", () => {
    expect(normalizeAttachmentType("NF.PDF", "application/octet-stream")).toBe("application/pdf");
    expect(normalizeAttachmentType("nf.xml", null)).toBe("application/xml");
    expect(normalizeAttachmentType("nf.pdf", "application/pdf; name=nf.pdf")).toBe("application/pdf");
  });
  it("ignora imagens embutidas e tipos não aceitos como NF", () => {
    expect(isInlinePart({ content_disposition: "inline" })).toBe(true);
    expect(isInlinePart({ content_disposition: "attachment", content_id: "x" })).toBe(false);
    const meta = { id: "x", filename: "f", content_type: null, download_url: "https://x" };
    const files = selectInvoiceFiles([
      { meta: { ...meta, content_disposition: "attachment" }, fileName: "nf.pdf", contentType: "application/pdf", bytes: pdf },
      { meta: { ...meta, content_disposition: "inline" }, fileName: "logo.png", contentType: "image/png", bytes: png },
      { meta, fileName: "planilha.xlsx", contentType: "application/vnd.ms-excel", bytes: pdf },
    ]);
    expect(files.map((f) => f.fileName)).toEqual(["nf.pdf"]);
  });
});

describe("processInboundEmail", () => {
  it("registra a resposta, anexa a NF ao pagamento, avança o status e encaminha", async () => {
    const sent: Array<Record<string, unknown>> = [];
    const result = await processInboundEmail("e1", deps(sent));
    expect(result).toMatchObject({ status: "PROCESSED", matchedThread: true, forwardStatus: "FORWARDED", invoiceAttachments: 1 });

    expect(h.state.inbound[0]).toMatchObject({
      resendEmailId: "e1",
      referenceType: "ConsultantPayment",
      referenceId: "pay1",
      forwardStatus: "FORWARDED",
      forwardedTo: ["fin@jump.test"],
    });
    expect(h.state.attachments).toHaveLength(1);
    expect(h.state.attachments[0]).toMatchObject({
      consultantPaymentId: "pay1",
      fileName: "nf-outubro.pdf",
      contentType: "application/pdf",
      source: "EMAIL",
      inboundEmailId: "in1",
    });
    expect(h.state.uploads[0]).toMatch(/^consultant-invoices\/pay1\//);
    expect(h.state.paymentStatus).toBe("INVOICE_RECEIVED");
    expect(h.state.audits[0]).toMatchObject({ action: "CONSULTANT_PAYMENT_INVOICE_RECEIVED_BY_EMAIL" });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ["fin@jump.test"], replyTo: ["Ana PJ <ana@pj.test>"] });
    expect((sent[0].attachments as unknown[]).length).toBe(2);
  });

  it("é idempotente por e-mail do Resend", async () => {
    const sent: Array<Record<string, unknown>> = [];
    await processInboundEmail("e1", deps(sent));
    const again = await processInboundEmail("e1", deps(sent));
    expect(again.status).toBe("DUPLICATE");
    expect(sent).toHaveLength(1);
    expect(h.state.attachments).toHaveLength(1);
  });

  it("sem destino configurado ainda guarda a NF (evento capturado)", async () => {
    h.state.forwardTo = [];
    const sent: Array<Record<string, unknown>> = [];
    const result = await processInboundEmail("e2", deps(sent));
    expect(result).toMatchObject({ forwardStatus: "NO_RECIPIENTS", invoiceAttachments: 1 });
    expect(sent).toHaveLength(0);
  });

  it("pagamento já validado: resposta fica registrada, NF não é anexada", async () => {
    h.state.paymentStatus = "INVOICE_VALIDATED";
    const result = await processInboundEmail("e3", deps([]));
    expect(result).toMatchObject({ invoiceAttachments: 0, invoiceSkipped: "PAYMENT_LOCKED" });
    expect(h.state.paymentStatus).toBe("INVOICE_VALIDATED");
    expect(h.state.attachments).toHaveLength(0);
    expect(h.state.inbound).toHaveLength(1);
  });

  it("remetente diferente do consultor não anexa NF", async () => {
    const d = deps([]);
    const base = d.getReceivedEmail;
    d.getReceivedEmail = async (id: string) => ({ ...(await base(id)), from: "contador@outro.test" });
    const result = await processInboundEmail("e4", d);
    expect(result).toMatchObject({ invoiceAttachments: 0, invoiceSkipped: "SENDER_MISMATCH" });
    expect(h.state.paymentStatus).toBe("WAITING_FOR_INVOICE");
  });

  it("retoma processamento PENDING após falha (sem duplicar a NF)", async () => {
    const d = deps([]);
    let fail = true;
    d.listReceivedAttachments = (async () => {
      if (fail) throw new Error("timeout");
      return deps([]).listReceivedAttachments();
    }) as typeof d.listReceivedAttachments;
    await expect(processInboundEmail("e5", d, new Date("2026-11-11T15:00:00.000Z"))).rejects.toThrow("timeout");
    expect(h.state.inbound[0].forwardStatus).toBe("PENDING");
    // Reentrega imediata: outra execução pode estar rodando → DUPLICATE.
    expect((await processInboundEmail("e5", d, new Date("2026-11-11T15:00:10.000Z"))).status).toBe("DUPLICATE");
    fail = false;
    const resumed = await processInboundEmail("e5", d, new Date("2026-11-11T15:05:00.000Z"));
    expect(resumed).toMatchObject({ status: "PROCESSED", invoiceAttachments: 1 });
    expect(h.state.inbound).toHaveLength(1);
    expect(h.state.attachments).toHaveLength(1);
  });

  it("e-mail sem token guarda só metadados", async () => {
    const d = deps([]);
    const base = d.getReceivedEmail;
    d.getReceivedEmail = async (id: string) => ({ ...(await base(id)), to: ["respostas@in.flow.test"] });
    const result = await processInboundEmail("e6", d);
    expect(result).toMatchObject({ matchedThread: false, forwardStatus: "NO_RECIPIENTS" });
    expect(h.state.inbound[0]).toMatchObject({ htmlBody: null, textBody: null });
  });
});
