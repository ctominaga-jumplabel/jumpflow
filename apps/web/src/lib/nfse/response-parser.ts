/**
 * Pure NFS-e response parser (Fase H — Padrao Prefeitura de Sao Paulo).
 *
 * Extracts the issued invoice number, protocol and any errors from the SP Web
 * Service XML response. DETERMINISTIC and side-effect free: it is a tolerant,
 * dependency-free reader (regex over the relevant tags) so it stays testable
 * with fixtures and never pulls a heavy XML parser into the bundle.
 *
 * The SP layout returns, on success, a <ChaveNFe> with <NumeroNFe> and a
 * <CodigoVerificacao>, plus a numeric protocol. On failure it returns one or
 * more <Erro>/<Alerta> blocks with <Codigo> + <Descricao>.
 */

export interface NfseResponseError {
  code: string | null;
  message: string;
}

export interface NfseParsedResponse {
  success: boolean;
  invoiceNumber: string | null;
  verificationCode: string | null;
  protocol: string | null;
  errors: NfseResponseError[];
}

/** First captured group of `pattern` within `xml`, trimmed; null if absent. */
function firstMatch(xml: string, pattern: RegExp): string | null {
  const match = pattern.exec(xml);
  const value = match?.[1]?.trim();
  return value && value.length > 0 ? value : null;
}

/** Read a tag value ignoring namespace prefixes (e.g. <ns2:NumeroNFe>). */
function readTag(xml: string, tag: string): string | null {
  // Allow optional namespace prefix and surrounding whitespace.
  const pattern = new RegExp(
    `<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`,
    "i",
  );
  return firstMatch(xml, pattern);
}

/** Collect every occurrence of a tag (namespace-agnostic). */
function readAllBlocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`,
    "gi",
  );
  const blocks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(xml)) != null) {
    blocks.push(match[1] ?? "");
  }
  return blocks;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Parse the SP NFS-e response XML. Tolerant: returns a structured result with
 * `success=false` and the collected errors when the payload is empty, malformed
 * or carries <Erro>/<Alerta> blocks. NEVER throws.
 */
export function parseNfseResponse(xml: string): NfseParsedResponse {
  const safe = typeof xml === "string" ? xml : "";

  const errors: NfseResponseError[] = [];
  // The SP layout nests <Codigo>/<Descricao> inside <Erro> (and <Alerta>).
  for (const tag of ["Erro", "Alerta"]) {
    for (const block of readAllBlocks(safe, tag)) {
      const message = readTag(block, "Descricao");
      const code = readTag(block, "Codigo");
      if (message || code) {
        errors.push({
          code,
          message: message ? decodeXmlEntities(message) : (code ?? "Erro NFS-e"),
        });
      }
    }
  }

  // Issued data lives under <ChaveNFe> (NumeroNFe + CodigoVerificacao). Some
  // responses expose <NumeroNFe> directly; read both.
  const chaveBlock = readTag(safe, "ChaveNFe");
  const numberSource = chaveBlock ?? safe;
  const invoiceNumber = readTag(numberSource, "NumeroNFe");
  const verificationCode = readTag(numberSource, "CodigoVerificacao");
  const protocol =
    readTag(safe, "NumeroLote") ??
    readTag(safe, "Protocolo") ??
    readTag(safe, "ChaveNFeRPS");

  // Some responses carry an explicit <Sucesso>true</Sucesso> flag.
  const sucessoFlag = readTag(safe, "Sucesso");
  const flaggedSuccess =
    sucessoFlag != null ? sucessoFlag.toLowerCase() === "true" : null;

  // Success requires an invoice number and no blocking error; an explicit
  // Sucesso=false is authoritative.
  const success =
    flaggedSuccess === false
      ? false
      : invoiceNumber != null && errors.length === 0;

  return {
    success,
    invoiceNumber: success ? invoiceNumber : invoiceNumber,
    verificationCode,
    protocol,
    errors,
  };
}

/** Human-readable summary of parser errors for FiscalDocument.errorMessage. */
export function summarizeNfseErrors(errors: NfseResponseError[]): string {
  if (errors.length === 0) return "Resposta NFS-e sem numero de nota.";
  return errors
    .map((e) => (e.code ? `[${e.code}] ${e.message}` : e.message))
    .join("; ");
}
