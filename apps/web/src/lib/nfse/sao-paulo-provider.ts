import type { ActionResult } from "@/lib/actions/result";
import type { NfseRuntimeConfig } from "./config";
import {
  buildRpsXml,
  deriveRpsReference,
  type NfseServiceLine,
} from "./xml-builder";
import { getNfseSigner } from "./signing";
import { parseNfseResponse, summarizeNfseErrors } from "./response-parser";
import type { NfseIssueRequest, NfseIssueResult, NfseProvider } from "./types";

/**
 * Real Sao Paulo NFS-e provider (Fase H). Pipeline:
 *
 *   1. Build the RPS XML from normalized data (pure, deterministic).
 *   2. Sign it with the A1 certificate (XMLDSig) via the pluggable signer.
 *      If no real signer is registered, this DEGRADES HONESTLY and returns an
 *      error — it never sends an unsigned/fabricated document.
 *   3. POST the signed envelope to the Prefeitura Web Service (SOAP).
 *   4. Parse the response for NumeroNFe + protocolo or errors.
 *
 * The certificate material (config.certificate) is touched ONLY by the signer.
 * It is never logged, never returned, never persisted.
 */
export class SaoPauloNfseProvider implements NfseProvider {
  constructor(private readonly config: NfseRuntimeConfig) {}

  async requestIssue(
    input: NfseIssueRequest,
  ): Promise<ActionResult<NfseIssueResult>> {
    // 1) Build RPS XML from normalized data.
    const lines: NfseServiceLine[] =
      input.lines && input.lines.length > 0
        ? input.lines.map((line) => ({
            serviceCode: line.serviceCode ?? "",
            description: line.description,
            amount: line.amount,
          }))
        : [
            {
              serviceCode: "",
              description: "Servicos prestados",
              amount: input.amount,
            },
          ];

    const rpsRef = deriveRpsReference(input.fiscalDocumentId);
    const built = buildRpsXml({
      prestador: {
        cnpj: this.config.prestador.cnpj,
        inscricaoMunicipal: this.config.prestador.inscricaoMunicipal,
      },
      tomador: {
        document: input.tomador?.document ?? "",
        name: input.tomador?.name ?? "Tomador",
        municipality: input.tomador?.municipality ?? null,
        email: input.tomador?.email ?? null,
      },
      rps: { serie: rpsRef.serie, numero: rpsRef.numero, issuedAt: new Date() },
      lines,
      issRate: input.issRate ?? 0,
      issWithheld: input.issWithheld ?? false,
      ambiente: this.config.ambiente,
      versao: this.config.versao,
    });

    // 2) Sign with the A1 certificate (pluggable). Honest degrade if absent.
    const signed = await getNfseSigner().sign({
      xml: built.xml,
      config: this.config,
    });
    if (!signed.ok) {
      return {
        ok: false,
        error: "UNEXPECTED",
        message:
          signed.reason ??
          "Falha ao assinar a NFS-e. Verifique o certificado digital A1.",
      };
    }

    // 3) Send to the Prefeitura Web Service (SOAP over HTTPS).
    let responseXml: string;
    try {
      responseXml = await this.send(signed.xml);
    } catch (error) {
      // SAFE error: never includes the certificate, password or endpoint creds.
      const message =
        error instanceof Error ? error.message : "Erro de comunicacao";
      return {
        ok: false,
        error: "UNEXPECTED",
        message: `Falha na comunicacao com a Prefeitura SP: ${message}`,
      };
    }

    // 4) Parse the response.
    const parsed = parseNfseResponse(responseXml);
    if (!parsed.success || !parsed.invoiceNumber) {
      return {
        ok: false,
        error: "UNEXPECTED",
        message: summarizeNfseErrors(parsed.errors),
      };
    }

    return {
      ok: true,
      data: {
        provider: "SAO_PAULO_NFSE",
        protocol: parsed.protocol ?? undefined,
        invoiceNumber: parsed.invoiceNumber,
        verificationCode: parsed.verificationCode ?? undefined,
        requestXml: signed.xml,
        responseXml,
      },
    };
  }

  /**
   * POST the signed envelope to the SP endpoint. Kept small + overridable so
   * tests can stub it without real network. The SOAP action/body wrapping is
   * the SP layout's `EnvioRPS`. No credential ever appears in logs.
   */
  protected async send(signedXml: string): Promise<string> {
    const envelope = wrapSoapEnvelope(signedXml);
    const response = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "http://www.prefeitura.sp.gov.br/nfe/ws/envioRPS",
      },
      body: envelope,
    });
    const text = await response.text();
    if (!response.ok) {
      // Status only — never the request body (which carries signed cert data).
      throw new Error(`HTTP ${response.status}`);
    }
    return text;
  }
}

/** Wrap the signed RPS XML in the SP SOAP envelope. Pure string composition. */
export function wrapSoapEnvelope(signedXml: string): string {
  const escaped = signedXml
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" ' +
      'xmlns:nfe="http://www.prefeitura.sp.gov.br/nfe">',
    "  <soap:Body>",
    "    <nfe:EnvioRPSRequest>",
    `      <nfe:VersaoSchema>1</nfe:VersaoSchema>`,
    `      <nfe:MensagemXML>${escaped}</nfe:MensagemXML>`,
    "    </nfe:EnvioRPSRequest>",
    "  </soap:Body>",
    "</soap:Envelope>",
  ].join("\n");
}
