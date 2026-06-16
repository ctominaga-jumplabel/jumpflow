/**
 * Pure RPS/NFS-e XML builder (Fase H — Padrao Prefeitura de Sao Paulo).
 *
 * Builds the "PedidoEnvioRPS" envelope used by the SP Web Service from already
 * normalized data (prestador config + tomador=Client + service lines + ISS).
 * DETERMINISTIC and side-effect free: same input -> same XML. No I/O, no
 * signing, no provider coupling — so it is trivially unit-testable offline.
 *
 * This intentionally produces the RPS body only. Signing (XMLDSig) and the SOAP
 * envelope wrapping happen downstream (signing.ts / provider), keeping concerns
 * separated and the hashable content stable.
 *
 * Money is formatted with 2 decimals and a dot separator (SP layout). Values
 * arrive already rounded to cents from the pre-invoice builder.
 */

export type NfseTipoTributacao =
  /** Tributado em Sao Paulo. */
  | "T"
  /** Tributado fora de Sao Paulo. */
  | "F"
  /** Isento. */
  | "I";

export interface NfseServiceLine {
  /** Codigo de servico da Prefeitura (LC 116 / municipal). */
  serviceCode: string;
  /** Free-text description (project name + competence, etc.). */
  description: string;
  /** Valor dos servicos for this line, already rounded to cents. */
  amount: number;
}

export interface NfseTomador {
  /** CNPJ (or CPF) digits only; may be empty when unknown. */
  document: string;
  name: string;
  municipality?: string | null;
  email?: string | null;
}

export interface NfseRpsInput {
  /** Prestador (Jump) identification. */
  prestador: {
    cnpj: string;
    inscricaoMunicipal: string;
  };
  tomador: NfseTomador;
  /** RPS series + number. The number is the local sequential RPS reference. */
  rps: {
    serie: string;
    numero: string;
    /** Emission date (date-only semantics). */
    issuedAt: Date;
  };
  lines: NfseServiceLine[];
  /** ISS rate as a 0-100 percentage (e.g. 2 = 2%). */
  issRate: number;
  /** Whether ISS is withheld at source (ISS retido). */
  issWithheld?: boolean;
  tributacao?: NfseTipoTributacao;
  ambiente: "homologacao" | "producao";
  /** Layout/version for the envelope. */
  versao: string;
}

export interface NfseRpsResult {
  /** The RPS XML body (without SOAP envelope, without signature). */
  xml: string;
  /** Sum of all line amounts (valor total dos servicos), rounded. */
  servicesTotal: number;
  /** Computed ISS = servicesTotal * issRate / 100, rounded. */
  issValue: number;
}

function roundCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** SP layout money format: fixed 2 decimals, dot separator, no thousands sep. */
function formatMoney(value: number): string {
  return roundCents(value).toFixed(2);
}

/** ISS aliquota in the SP layout is a fraction (e.g. 2% -> "0.02"). */
function formatAliquota(ratePercent: number): string {
  return roundCents(ratePercent / 100).toFixed(4);
}

/** YYYY-MM-DD using UTC to stay deterministic regardless of host timezone. */
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Escape the 5 XML-significant characters. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Digits only (CNPJ/CPF/IM never carry punctuation in the layout). */
function digits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Build the RPS XML. Deterministic. Lines are emitted in arrival order. The
 * tomador document length decides CPF (11) vs CNPJ (14) tags; an empty/short
 * document is omitted (consumidor nao identificado).
 */
export function buildRpsXml(input: NfseRpsInput): NfseRpsResult {
  const servicesTotal = roundCents(
    input.lines.reduce((sum, line) => sum + line.amount, 0),
  );
  const issValue = roundCents((servicesTotal * input.issRate) / 100);
  const tributacao = input.tributacao ?? "T";
  const issRetido = input.issWithheld ? "true" : "false";

  const tomadorDoc = digits(input.tomador.document);
  const tomadorCpfCnpj =
    tomadorDoc.length === 11
      ? `<CPF>${tomadorDoc}</CPF>`
      : tomadorDoc.length === 14
        ? `<CNPJ>${tomadorDoc}</CNPJ>`
        : "";
  const tomadorBlock = tomadorCpfCnpj
    ? [
        "    <CPFCNPJTomador>",
        `      ${tomadorCpfCnpj}`,
        "    </CPFCNPJTomador>",
        `    <RazaoSocialTomador>${escapeXml(input.tomador.name)}</RazaoSocialTomador>`,
        input.tomador.email
          ? `    <EmailTomador>${escapeXml(input.tomador.email)}</EmailTomador>`
          : "",
      ]
        .filter((line) => line.length > 0)
        .join("\n")
    : `    <RazaoSocialTomador>${escapeXml(input.tomador.name)}</RazaoSocialTomador>`;

  const discriminacao = escapeXml(
    input.lines
      .map((line) => `${line.description}: ${formatMoney(line.amount)}`)
      .join(" | "),
  );

  const xml = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<PedidoEnvioRPS xmlns="http://www.prefeitura.sp.gov.br/nfe" versao="${escapeXml(
      input.versao,
    )}">`,
    "  <Cabecalho versao=\"" + escapeXml(input.versao) + "\">",
    `    <Ambiente>${input.ambiente === "producao" ? "P" : "H"}</Ambiente>`,
    "    <CPFCNPJRemetente>",
    `      <CNPJ>${digits(input.prestador.cnpj)}</CNPJ>`,
    "    </CPFCNPJRemetente>",
    "  </Cabecalho>",
    "  <RPS>",
    `    <Assinatura></Assinatura>`,
    "    <ChaveRPS>",
    `      <InscricaoPrestador>${digits(input.prestador.inscricaoMunicipal)}</InscricaoPrestador>`,
    `      <SerieRPS>${escapeXml(input.rps.serie)}</SerieRPS>`,
    `      <NumeroRPS>${escapeXml(input.rps.numero)}</NumeroRPS>`,
    "    </ChaveRPS>",
    `    <TipoRPS>RPS</TipoRPS>`,
    `    <DataEmissao>${formatDate(input.rps.issuedAt)}</DataEmissao>`,
    `    <StatusRPS>N</StatusRPS>`,
    `    <TributacaoRPS>${tributacao}</TributacaoRPS>`,
    `    <ValorServicos>${formatMoney(servicesTotal)}</ValorServicos>`,
    `    <ValorDeducoes>0.00</ValorDeducoes>`,
    `    <AliquotaServicos>${formatAliquota(input.issRate)}</AliquotaServicos>`,
    `    <ISSRetido>${issRetido}</ISSRetido>`,
    `    <ValorISS>${formatMoney(issValue)}</ValorISS>`,
    tomadorBlock,
    `    <Discriminacao>${discriminacao}</Discriminacao>`,
    "  </RPS>",
    "</PedidoEnvioRPS>",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  return { xml, servicesTotal, issValue };
}

/**
 * Stable RPS series + number derived from the fiscal document id. The SP layout
 * requires a numeric NumeroRPS; we derive a deterministic positive integer from
 * the id so the same document always maps to the same RPS (idempotency-friendly).
 * Real production sequencing should come from a dedicated counter, but this is
 * deterministic and collision-resistant enough for the envelope.
 */
export function deriveRpsReference(fiscalDocumentId: string): {
  serie: string;
  numero: string;
} {
  let hash = 0;
  for (let i = 0; i < fiscalDocumentId.length; i += 1) {
    hash = (hash * 31 + fiscalDocumentId.charCodeAt(i)) >>> 0;
  }
  // Keep within a 9-digit positive range (SP NumeroRPS is limited).
  const numero = String((hash % 999_999_999) + 1);
  return { serie: "RPS", numero };
}
