import { describe, expect, it } from "vitest";
import { dataTable } from "./layout";
import {
  renderTemplateBody,
  renderTemplateEmail,
  substitutePlain,
  validateEmailTemplate,
} from "./template-renderer";

const blockKeys = ["tabela"];

function bodyHtml(body: string, vars: Record<string, unknown> = {}) {
  const { blocks, title } = renderTemplateBody(
    body,
    vars as never,
    blockKeys,
  );
  return { html: blocks.map((b) => b.html).join("\n"), text: blocks.map((b) => b.text).join("\n"), title };
}

describe("renderTemplateBody — escaping", () => {
  it("escapes HTML in variable values", () => {
    const { html, text } = bodyHtml("Olá, {{nome}}.", { nome: '<script>alert("x")</script>' });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(text).toContain('<script>alert("x")</script>'); // texto plano fica cru
  });

  it("escapes HTML typed in the template itself", () => {
    const { html } = bodyHtml("<b>oi</b> & tchau");
    expect(html).toContain("&lt;b&gt;oi&lt;/b&gt; &amp; tchau");
  });

  it("does not interpret markdown coming from variable values", () => {
    const { html } = bodyHtml("Projeto {{p}}", { p: "**forte** [x](https://evil.test)" });
    expect(html).not.toContain("<strong");
    expect(html).not.toContain("<a ");
    expect(html).toContain("**forte** [x](https://evil.test)");
  });

  it("never injects a block from a non-whitelisted key", () => {
    const table = dataTable(["A"], [["<b>1</b>"]]);
    const { html } = bodyHtml("{{intruso}}", { intruso: table });
    expect(html).not.toContain("<table");
    expect(html).toContain("&lt;b&gt;1&lt;/b&gt;"); // projeção texto, escapada
  });
});

describe("renderTemplateBody — markdown", () => {
  it("renders title, paragraphs with <br/>, bold, lists, callouts and divider", () => {
    const { html, title } = bodyHtml(
      [
        "# Título {{x}}",
        "",
        "Linha 1",
        "Linha **2**",
        "",
        "- item a",
        "- item b",
        "",
        "> info",
        "",
        ">! cuidado",
        "",
        "---",
        "## Seção",
      ].join("\n"),
      { x: "X" },
    );
    expect(title).toBe("Título X");
    expect(html).toMatch(/Linha 1<br\/>Linha <strong[^>]*>2<\/strong>/);
    expect(html).toMatch(/<ul[^>]*><li[^>]*>item a<\/li><li[^>]*>item b<\/li><\/ul>/);
    expect(html).toContain("info");
    expect(html).toContain("cuidado");
    expect(html).toContain("<h2");
    expect(html).toContain("height:1px");
  });

  it("renders inline links only for safe schemes", () => {
    const ok = bodyHtml("Veja [aqui](https://a.test/x?y=1&z=2) agora").html;
    expect(ok).toContain('<a href="https://a.test/x?y=1&amp;z=2"');
    const bad = bodyHtml("Veja [aqui](javascript:alert(1)) agora").html;
    expect(bad).not.toContain("<a ");
    expect(bad).not.toContain("javascript:alert(1)\"");
  });

  it("renders a link alone on a line as a button, and drops it when the URL is empty", () => {
    const withUrl = bodyHtml("[Abrir]({{link}})", { link: "https://app.test/x" }).html;
    expect(withUrl).toContain('href="https://app.test/x"');
    expect(withUrl).toContain("Abrir");
    const without = bodyHtml("[Abrir]({{link}})", { link: "" });
    expect(without.html).toBe("");
  });

  it("injects whitelisted block variables alone on a line; empty blocks disappear", () => {
    const table = dataTable(["Consultor"], [["Ana"]]);
    const { html } = bodyHtml("Antes\n\n{{tabela}}\n\nDepois", { tabela: table });
    expect(html).toContain("<table");
    expect(html).toContain("Ana");
    const empty = bodyHtml("{{tabela}}", { tabela: null });
    expect(empty.html).toBe("");
  });

  it("unknown placeholders render empty", () => {
    const { text } = bodyHtml("Olá, {{nao_existe}}!");
    expect(text).toBe("Olá, !");
  });
});

describe("renderTemplateEmail", () => {
  it("renders the subject as plain single-line text and wraps the body in the layout", () => {
    const out = renderTemplateEmail({
      subject: "Aviso — {{p}}\n",
      body: "Olá, {{p}}.",
      vars: { p: "<Proj>" },
      blockKeys: [],
      defaultTitle: "Título padrão",
    });
    expect(out.subject).toBe("Aviso — <Proj>");
    expect(out.html).toContain("Título padrão");
    expect(out.html).toContain("Olá, &lt;Proj&gt;.");
    expect(out.text).toContain("Olá, <Proj>.");
  });

  it("substitutePlain flattens multi-line values", () => {
    expect(substitutePlain("{{a}}", { a: "x\n y" })).toBe("x y");
  });
});

describe("validateEmailTemplate", () => {
  const known = ["nome", "link", "tabela"];
  it("accepts a valid template", () => {
    const v = validateEmailTemplate({
      subject: "Olá {{nome}}",
      body: "Oi {{nome}}\n\n{{tabela}}",
      knownKeys: known,
      blockKeys: ["tabela"],
    });
    expect(v.ok).toBe(true);
    expect(v.issues).toEqual([]);
  });

  it("reports unknown and malformed variables", () => {
    const v = validateEmailTemplate({
      subject: "Olá {{nomee}}",
      body: "Oi {{ foo bar }}",
      knownKeys: known,
      blockKeys: ["tabela"],
    });
    expect(v.ok).toBe(false);
    expect(v.unknownVariables.sort()).toEqual(["foo bar", "nomee"]);
  });

  it("rejects blocks in the subject or inline in a sentence, and empty fields", () => {
    const v = validateEmailTemplate({
      subject: "{{tabela}}",
      body: "Veja {{tabela}} aqui",
      knownKeys: known,
      blockKeys: ["tabela"],
    });
    expect(v.issues.map((i) => i.field)).toEqual(["subject", "body"]);
    const empty = validateEmailTemplate({ subject: " ", body: "", knownKeys: known, blockKeys: [] });
    expect(empty.issues.length).toBe(2);
  });
});
