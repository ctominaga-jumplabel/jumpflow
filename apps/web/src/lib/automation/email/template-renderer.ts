/**
 * Renderer de templates de e-mail editáveis (ITEM 3 — /app/admin/templates-email).
 *
 * Puro (sem I/O): recebe assunto + corpo escritos pelo admin e os valores das
 * variáveis do evento e devolve `{ subject, html, text }` dentro do MESMO layout
 * de marca dos e-mails padrão (layout.ts), para que um template personalizado
 * não destoe visualmente.
 *
 * Sintaxe do corpo (texto puro com markdown leve):
 *   # Título              → título do cartão (só se for a 1ª linha não vazia)
 *   ## Subtítulo          → heading
 *   linha em branco       → separa parágrafos; quebra simples vira <br/>
 *   - item / * item       → lista com marcadores
 *   > texto               → destaque informativo
 *   >! texto              → destaque de atenção
 *   ---                   → divisória
 *   **negrito**           → <strong>
 *   [rótulo](url)         → link; SOZINHO na linha vira botão (CTA)
 *   {{variavel}}          → valor do evento (sempre escapado)
 *   {{bloco}} sozinho     → bloco pronto (tabela/resumo) — só chaves na
 *                           whitelist `blockKeys` injetam HTML
 *
 * Segurança: o markdown é aplicado SOBRE o texto do template antes da
 * substituição — valores de variáveis nunca são interpretados como markdown nem
 * como HTML (sempre escapados). Links só aceitam http(s) e mailto. Variáveis
 * desconhecidas renderizam vazio e são reportadas por `validateEmailTemplate`.
 */
import {
  button,
  divider,
  heading,
  renderEmail,
  type EmailBlock,
  type EmailBrand,
} from "./layout";
import { emailTheme, toneColors, type EmailTone } from "./theme";

const C = emailTheme.color;

/** Valor de uma variável: texto simples ou um bloco pronto (tabela, KPI...). */
export type TemplateVarValue = string | EmailBlock | null | undefined;
export type TemplateVars = Record<string, TemplateVarValue>;

export interface RenderTemplateInput {
  subject: string;
  body: string;
  vars: TemplateVars;
  /** Chaves autorizadas a injetar HTML de bloco (whitelist do evento). */
  blockKeys: ReadonlySet<string> | readonly string[];
  /** Título do cartão quando o corpo não começa com "# ...". */
  defaultTitle: string;
  brand?: EmailBrand;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

/** `{{ chave }}` — chaves com letras, números, `_` e `.`. */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
/** Qualquer `{{ ... }}` (inclusive malformado) — usado pelo validador. */
const ANY_BRACES = /\{\{([^{}]*)\}\}/g;
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const BUTTON_LINE = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/;
const BLOCK_LINE = /^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/;

const SUBJECT_MAX = 200;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isBlock(value: TemplateVarValue): value is EmailBlock {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as EmailBlock).html === "string" &&
    typeof (value as EmailBlock).text === "string"
  );
}

/** Texto plano de um valor (blocos viram a projeção texto). */
function plainValue(value: TemplateVarValue): string {
  if (value == null) return "";
  if (isBlock(value)) return value.text;
  return String(value);
}

/** Substitui placeholders por texto plano (assunto, título, URL). */
export function substitutePlain(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key)
      ? plainValue(vars[key]).replace(/\s*\n\s*/g, " ")
      : "",
  );
}

function safeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^https?:\/\/[^\s]+$/i.test(url) || /^mailto:[^\s]+$/i.test(url)) return url;
  return null;
}

// ---------------------------------------------------------------------------
// Inline: **negrito**, [link](url) e {{variáveis}}
// ---------------------------------------------------------------------------
interface Inline {
  html: string;
  text: string;
}

/** Negrito + variáveis. Valores entram via sentinela → nunca viram markdown. */
function renderSpan(src: string, vars: TemplateVars): Inline {
  const values: string[] = [];
  const withSentinels = src.replace(PLACEHOLDER, (_m, key: string) => {
    const v = Object.prototype.hasOwnProperty.call(vars, key)
      ? plainValue(vars[key])
      : "";
    values.push(v);
    return `\u0001${values.length - 1}\u0002`;
  });
  const restore = (s: string, map: (v: string) => string) =>
    s.replace(/\u0001(\d+)\u0002/g, (_m, i: string) => map(values[Number(i)] ?? ""));

  const html = restore(
    escapeHtml(withSentinels).replace(
      /\*\*([^*]+?)\*\*/g,
      `<strong style="color:${C.textStrong};">$1</strong>`,
    ),
    (v) => escapeHtml(v),
  );
  const text = restore(withSentinels.replace(/\*\*([^*]+?)\*\*/g, "$1"), (v) => v);
  return { html, text };
}

function renderInline(src: string, vars: TemplateVars): Inline {
  let html = "";
  let text = "";
  let last = 0;
  for (const match of src.matchAll(LINK)) {
    const idx = match.index ?? 0;
    const before = renderSpan(src.slice(last, idx), vars);
    html += before.html;
    text += before.text;
    const label = renderSpan(match[1], vars);
    const url = safeUrl(substitutePlain(match[2], vars));
    if (url) {
      html += `<a href="${escapeHtml(url)}" style="color:${C.blue};text-decoration:underline;">${label.html}</a>`;
      text += `${label.text} (${url})`;
    } else {
      html += label.html;
      text += label.text;
    }
    last = idx + match[0].length;
  }
  const rest = renderSpan(src.slice(last), vars);
  return { html: html + rest.html, text: text + rest.text };
}

// ---------------------------------------------------------------------------
// Blocos
// ---------------------------------------------------------------------------
function paragraphBlock(lines: string[], vars: TemplateVars): EmailBlock | null {
  const parts = lines.map((l) => renderInline(l, vars));
  const text = parts.map((p) => p.text).join("\n");
  if (text.trim() === "") return null;
  return {
    html: `<p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:${C.textMedium};">${parts
      .map((p) => p.html)
      .join("<br/>")}</p>`,
    text,
  };
}

function listBlock(items: string[], vars: TemplateVars): EmailBlock | null {
  const rendered = items
    .map((i) => renderInline(i, vars))
    .filter((r) => r.text.trim() !== "");
  if (rendered.length === 0) return null;
  return {
    html: `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.55;color:${C.textMedium};">${rendered
      .map((r) => `<li style="margin:0 0 4px;">${r.html}</li>`)
      .join("")}</ul>`,
    text: rendered.map((r) => `- ${r.text}`).join("\n"),
  };
}

function calloutBlock(
  lines: string[],
  tone: EmailTone,
  vars: TemplateVars,
): EmailBlock | null {
  const parts = lines.map((l) => renderInline(l, vars));
  const text = parts.map((p) => p.text).join("\n");
  if (text.trim() === "") return null;
  const { text: fg, bg } = toneColors(tone);
  return {
    html: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td style="padding:14px 16px;background:${bg};border-radius:${emailTheme.radius};font-size:14px;line-height:1.5;color:${fg};font-weight:600;">${parts
      .map((p) => p.html)
      .join("<br/>")}</td></tr></table>`,
    text: `>> ${text}`,
  };
}

interface ParsedBody {
  title: string | null;
  blocks: EmailBlock[];
}

function toKeySet(keys: ReadonlySet<string> | readonly string[]): ReadonlySet<string> {
  return keys instanceof Set ? keys : new Set(keys as readonly string[]);
}

/** Converte o corpo (markdown leve + placeholders) em blocos do layout. */
export function renderTemplateBody(
  body: string,
  vars: TemplateVars,
  blockKeys: ReadonlySet<string> | readonly string[],
): ParsedBody {
  const allowedBlocks = toKeySet(blockKeys);
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const blocks: EmailBlock[] = [];
  let title: string | null = null;
  let seenContent = false;

  let para: string[] = [];
  let list: string[] = [];
  let quote: { tone: EmailTone; lines: string[] } | null = null;

  const push = (b: EmailBlock | null) => {
    if (b) blocks.push(b);
  };
  const flush = () => {
    if (para.length) push(paragraphBlock(para, vars));
    if (list.length) push(listBlock(list, vars));
    if (quote) push(calloutBlock(quote.lines, quote.tone, vars));
    para = [];
    list = [];
    quote = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      flush();
      continue;
    }

    if (!seenContent && /^#\s+/.test(line)) {
      seenContent = true;
      title = substitutePlain(line.replace(/^#\s+/, ""), vars).trim() || null;
      continue;
    }
    seenContent = true;

    if (/^##\s+/.test(line)) {
      flush();
      const t = substitutePlain(line.replace(/^##\s+/, ""), vars).trim();
      if (t) push(heading(t));
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      flush();
      push(divider());
      continue;
    }

    const blockMatch = BLOCK_LINE.exec(line);
    if (blockMatch) {
      flush();
      const key = blockMatch[1];
      const value = Object.prototype.hasOwnProperty.call(vars, key)
        ? vars[key]
        : undefined;
      if (isBlock(value) && allowedBlocks.has(key)) {
        if (value.html.trim() !== "" || value.text.trim() !== "") push(value);
      } else {
        // Escalar (ou bloco fora da whitelist): parágrafo com valor escapado.
        push(paragraphBlock([line], vars));
      }
      continue;
    }

    const buttonMatch = BUTTON_LINE.exec(line);
    if (buttonMatch) {
      flush();
      const url = safeUrl(substitutePlain(buttonMatch[2], vars));
      const label = substitutePlain(buttonMatch[1], vars).trim();
      // Sem URL válida (ex.: app sem URL pública) o botão some — como no padrão.
      if (url && label) push(button(label, url));
      continue;
    }

    const listMatch = /^[-*]\s+(.*)$/.exec(line);
    if (listMatch) {
      if (para.length || quote) flush();
      list.push(listMatch[1]);
      continue;
    }

    const quoteMatch = /^>(!?)\s?(.*)$/.exec(line);
    if (quoteMatch) {
      const tone: EmailTone = quoteMatch[1] ? "warning" : "info";
      if (para.length || list.length || (quote && quote.tone !== tone)) flush();
      if (!quote) quote = { tone, lines: [] };
      quote.lines.push(quoteMatch[2]);
      continue;
    }

    if (list.length || quote) flush();
    para.push(line);
  }
  flush();

  return { title, blocks };
}

/** Renderiza assunto + corpo personalizados dentro do layout de marca. */
export function renderTemplateEmail(input: RenderTemplateInput): RenderedTemplate {
  const subject = substitutePlain(input.subject, input.vars)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SUBJECT_MAX);
  const { title, blocks } = renderTemplateBody(
    input.body,
    input.vars,
    input.blockKeys,
  );
  const { html, text } = renderEmail({
    brand: input.brand ?? "product",
    preheader: subject,
    title: title ?? substitutePlain(input.defaultTitle, input.vars),
    blocks,
  });
  return { subject, html, text };
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------
export interface TemplateValidationIssue {
  field: "subject" | "body";
  message: string;
}

export interface TemplateValidation {
  ok: boolean;
  /** Placeholders não reconhecidos (renderizam vazio). */
  unknownVariables: string[];
  issues: TemplateValidationIssue[];
}

export const TEMPLATE_LIMITS = { subjectMax: SUBJECT_MAX, bodyMax: 20_000 } as const;

/** Chaves `{{...}}` usadas num texto (inclui malformadas, sem trim). */
function placeholdersIn(text: string): string[] {
  return Array.from(text.matchAll(ANY_BRACES), (m) => m[1].trim());
}

export function validateEmailTemplate(input: {
  subject: string;
  body: string;
  /** Todas as chaves válidas do evento (escalares + blocos). */
  knownKeys: readonly string[];
  blockKeys: readonly string[];
}): TemplateValidation {
  const known = new Set(input.knownKeys);
  const blocks = new Set(input.blockKeys);
  const issues: TemplateValidationIssue[] = [];
  const unknown = new Set<string>();

  const subject = input.subject.trim();
  if (!subject) issues.push({ field: "subject", message: "Informe o assunto." });
  if (input.subject.length > SUBJECT_MAX)
    issues.push({
      field: "subject",
      message: `O assunto deve ter no máximo ${SUBJECT_MAX} caracteres.`,
    });
  if (/\n/.test(input.subject))
    issues.push({ field: "subject", message: "O assunto deve ter uma única linha." });
  if (!input.body.trim()) issues.push({ field: "body", message: "Informe o corpo do e-mail." });
  if (input.body.length > TEMPLATE_LIMITS.bodyMax)
    issues.push({
      field: "body",
      message: `O corpo deve ter no máximo ${TEMPLATE_LIMITS.bodyMax} caracteres.`,
    });

  for (const [field, text] of [
    ["subject", input.subject],
    ["body", input.body],
  ] as const) {
    for (const key of placeholdersIn(text)) {
      if (!/^[A-Za-z0-9_.]+$/.test(key) || !known.has(key)) {
        unknown.add(key);
        issues.push({
          field,
          message: `Variável desconhecida: {{${key}}} — será enviada em branco.`,
        });
      } else if (field === "subject" && blocks.has(key)) {
        issues.push({
          field,
          message: `{{${key}}} é um bloco (tabela/resumo) e não pode ir no assunto.`,
        });
      }
    }
  }

  // Bloco usado no meio de uma frase: renderiza só a versão texto.
  for (const rawLine of input.body.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (BLOCK_LINE.test(line)) continue;
    for (const m of line.matchAll(PLACEHOLDER)) {
      if (blocks.has(m[1])) {
        issues.push({
          field: "body",
          message: `{{${m[1]}}} é um bloco: deixe-o sozinho em uma linha para exibir a tabela/resumo.`,
        });
      }
    }
  }

  return { ok: issues.length === 0, unknownVariables: Array.from(unknown), issues };
}

/** Hash curto e estável (djb2) do corpo — usado na auditoria. */
export function templateHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, "0");
}
