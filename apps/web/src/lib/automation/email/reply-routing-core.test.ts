import { describe, expect, it } from "vitest";
import {
  bareAddress,
  buildReplyAddress,
  findReplyToken,
  generateReplyToken,
  parseReplyToken,
  parseStoredReplyRecipients,
  prepareInboundHtmlForPreview,
  replyRecipientsSchema,
} from "./reply-routing-core";

describe("token do Reply-To", () => {
  it("gera 24 caracteres base32 minúsculos", () => {
    const token = generateReplyToken(new Uint8Array(15).map((_, i) => i * 17));
    expect(token).toMatch(/^[a-z2-7]{24}$/);
  });
  it("monta e lê o endereço de resposta (case-insensitive no domínio)", () => {
    const token = "abcdefghijklmnop2345";
    const address = buildReplyAddress("respostas", token, "in.flow.test");
    expect(address).toBe(`respostas+${token}@in.flow.test`);
    expect(parseReplyToken(`Flow <${address.toUpperCase().replace(token.toUpperCase(), token)}>`, "IN.flow.test")).toBe(token);
    expect(parseReplyToken(address, "outro.dominio")).toBeNull();
    expect(parseReplyToken("respostas@in.flow.test", "in.flow.test")).toBeNull();
    expect(parseReplyToken("respostas+x!@in.flow.test", "in.flow.test")).toBeNull();
  });
  it("acha o token entre os destinatários", () => {
    expect(
      findReplyToken(["financeiro@jump.test", "respostas+abcdefghijklmnop@in.flow.test"], "in.flow.test"),
    ).toBe("abcdefghijklmnop");
    expect(findReplyToken(["financeiro@jump.test"], "in.flow.test")).toBeNull();
  });
  it("extrai o endereço de 'Nome <email>'", () => {
    expect(bareAddress("Ana Souza <Ana@Empresa.com>")).toBe("ana@empresa.com");
    expect(bareAddress(" x@y.z ")).toBe("x@y.z");
  });
});

describe("destinatários das respostas", () => {
  it("valida e-mails e perfis, normaliza e remove duplicados", () => {
    const parsed = replyRecipientsSchema.parse([
      { type: "STATIC", address: " Fin@Jump.test " },
      { type: "STATIC", address: "fin@jump.test" },
      { type: "ROLE", address: "FINANCE" },
    ]);
    expect(parsed).toEqual([
      { type: "STATIC", address: "fin@jump.test" },
      { type: "ROLE", address: "FINANCE" },
    ]);
    expect(replyRecipientsSchema.safeParse([{ type: "STATIC", address: "não-é-email" }]).success).toBe(false);
    expect(replyRecipientsSchema.safeParse([{ type: "ROLE", address: "CHEFE" }]).success).toBe(false);
  });
  it("JSON gravado inválido vira lista vazia", () => {
    expect(parseStoredReplyRecipients("lixo")).toEqual([]);
    expect(parseStoredReplyRecipients([{ type: "ROLE", address: "PEOPLE" }])).toEqual([
      { type: "ROLE", address: "PEOPLE" },
    ]);
  });
});

describe("prévia do HTML recebido", () => {
  it("remove meta refresh e bloqueia cargas remotas via CSP", () => {
    const html = prepareInboundHtmlForPreview(
      '<meta http-equiv="refresh" content="0;url=https://phish.test"><img src="https://pixel.test/x.gif">',
    );
    expect(html).not.toContain("phish.test");
    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
  });
});
