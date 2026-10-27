import { beforeEach, describe, expect, it, vi } from "vitest";

const dbConfigured = vi.fn(() => true);
vi.mock("@/lib/db/config", () => ({ isDatabaseConfigured: () => dbConfigured() }));

const findUnique = vi.fn();
vi.mock("@jumpflow/database", () => ({
  prisma: { emailTemplate: { findUnique: (...a: unknown[]) => findUnique(...a) } },
}));

import {
  applyEmailTemplate,
  applyEmailTemplateToFragments,
  invalidateEmailTemplateCache,
} from "./apply-template";
import { paragraph } from "./layout";
import type { NotificationFragment } from "../notifications/dispatch";

const DEFAULT = { subject: "Padrão", html: "<p>padrão</p>", text: "padrão" };
const vars = { "destinatario.nome": "Ana", "projeto.nome": "Portal" };

beforeEach(() => {
  findUnique.mockReset();
  dbConfigured.mockReturnValue(true);
  invalidateEmailTemplateCache();
});

describe("applyEmailTemplate — fail-open", () => {
  it("no database → default", async () => {
    dbConfigured.mockReturnValue(false);
    expect(await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT)).toBe(DEFAULT);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("no row → default", async () => {
    findUnique.mockResolvedValue(null);
    expect(await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT)).toBe(DEFAULT);
  });

  it("inactive row → default", async () => {
    findUnique.mockResolvedValue({ subject: "X", body: "Y", active: false });
    expect(await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT)).toBe(DEFAULT);
  });

  it("DB error (e.g. table missing) → default, never throws", async () => {
    findUnique.mockRejectedValue(new Error("relation does not exist"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT)).toBe(DEFAULT);
    spy.mockRestore();
  });

  it("subject that renders empty → default", async () => {
    findUnique.mockResolvedValue({ subject: "{{desconhecida}}", body: "Oi", active: true });
    expect(await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT)).toBe(DEFAULT);
  });

  it("event without email (unknown event) → default", async () => {
    findUnique.mockResolvedValue({ subject: "X", body: "Y", active: true });
    expect(await applyEmailTemplate("NAO_EXISTE", vars, DEFAULT)).toBe(DEFAULT);
  });
});

describe("applyEmailTemplate — custom", () => {
  it("active row → renders the custom subject/body with escaped values", async () => {
    findUnique.mockResolvedValue({
      subject: "Liberado: {{projeto.nome}}",
      body: "Olá, {{destinatario.nome}}! <b>",
      active: true,
    });
    const out = await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT);
    expect(out.subject).toBe("Liberado: Portal");
    expect(out.html).toContain("Olá, Ana! &lt;b&gt;");
    expect(out.text).toContain("Olá, Ana!");
  });

  it("caches the lookup per event (TTL)", async () => {
    findUnique.mockResolvedValue(null);
    await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT);
    await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT);
    expect(findUnique).toHaveBeenCalledTimes(1);
    invalidateEmailTemplateCache("HOURS_RELEASED");
    await applyEmailTemplate("HOURS_RELEASED", vars, DEFAULT);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});

describe("applyEmailTemplateToFragments", () => {
  const recipient = { key: "a@x.com", channel: "EMAIL" as const, address: "a@x.com", name: "Ana" };

  it("replaces prebuilt + title for fragments carrying templateVars", async () => {
    findUnique.mockResolvedValue({ subject: "Novo: {{projeto.nome}}", body: "Oi", active: true });
    const fragments: NotificationFragment[] = [
      { recipient, title: "Padrão", prebuilt: DEFAULT, templateVars: vars },
      { recipient: { ...recipient, key: "b" }, title: "Sem vars", prebuilt: DEFAULT },
    ];
    await applyEmailTemplateToFragments("PROJECT_CREATED", fragments);
    expect(fragments[0].title).toBe("Novo: Portal");
    expect(fragments[0].prebuilt?.subject).toBe("Novo: Portal");
    expect(fragments[1].prebuilt).toBe(DEFAULT);
  });

  it("generic-content events use {{titulo}} + {{conteudo}} from blocks", async () => {
    findUnique.mockResolvedValue({
      subject: "[SLA] {{titulo}}",
      body: "Atenção, {{destinatario.nome}}.\n\n{{conteudo}}",
      active: true,
    });
    const fragments: NotificationFragment[] = [
      { recipient, title: "SLA vence hoje", blocks: [paragraph("Pendências: 3")] },
    ];
    await applyEmailTemplateToFragments("SLA_OVERDUE", fragments);
    expect(fragments[0].title).toBe("[SLA] SLA vence hoje");
    expect(fragments[0].prebuilt?.text).toContain("Atenção, Ana.");
    expect(fragments[0].prebuilt?.text).toContain("Pendências: 3");
  });

  it("does not touch Teams fragments nor query the DB when nothing applies", async () => {
    const fragments: NotificationFragment[] = [
      { recipient: { ...recipient, channel: "TEAMS" }, title: "T", blocks: [paragraph("x")] },
    ];
    await applyEmailTemplateToFragments("SLA_OVERDUE", fragments);
    expect(findUnique).not.toHaveBeenCalled();
    expect(fragments[0].prebuilt).toBeUndefined();
  });
});
