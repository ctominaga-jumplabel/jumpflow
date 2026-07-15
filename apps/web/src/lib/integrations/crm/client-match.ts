import type { Prisma } from "@jumpflow/database";
import type { CrmClient } from "./contract";

/**
 * CRM -> JumpFlow client de/para (FASE 1, ingestao / D11).
 *
 * Match por CNPJ normalizado (14 digitos). `Client.document` NAO e @unique no
 * schema: a de-duplicacao e app-level (findFirst), nunca uma garantia do banco.
 * Sem match => CRIA o Client (nunca rejeita/bloqueia, senao um cadastro faltante
 * derrubaria a criacao do projeto inteiro). Sem document valido => cria por nome.
 *
 * Recebe o `tx` (client transacional) para participar da transacao coesa da
 * ingestao — a criacao do Client precisa cair junto com o resto em caso de falha.
 */

/** Client criado por nao haver match de CNPJ. */
export const WARNING_CLIENT_CREATED = "CLIENT_CREATED";
/** Client criado sem CNPJ valido (document ausente/curto) — dedupe so por nome. */
export const WARNING_CLIENT_DOCUMENT_MISSING = "CLIENT_DOCUMENT_MISSING";

export interface ResolveClientResult {
  clientId: string;
  warnings: string[];
}

/** Subconjunto do client Prisma que este helper usa (tx satisfaz). */
type ClientDelegateHost = {
  client: Prisma.TransactionClient["client"];
};

/**
 * Resolve (ou cria) o Client do JumpFlow a partir do bloco `client` do CRM.
 * O document ja chega normalizado a 14 digitos pelo contrato Zod, mas
 * re-normalizamos defensivamente aqui.
 */
export async function resolveClientId(
  tx: ClientDelegateHost,
  client: CrmClient,
): Promise<ResolveClientResult> {
  const normalized = (client.document ?? "").replace(/\D/g, "");

  if (normalized.length !== 14) {
    const created = await tx.client.create({
      data: { name: client.name, status: "ACTIVE" },
      select: { id: true },
    });
    return { clientId: created.id, warnings: [WARNING_CLIENT_DOCUMENT_MISSING] };
  }

  const existing = await tx.client.findFirst({
    where: { document: normalized },
    select: { id: true },
  });
  if (existing) {
    return { clientId: existing.id, warnings: [] };
  }

  const created = await tx.client.create({
    data: { name: client.name, document: normalized, status: "ACTIVE" },
    select: { id: true },
  });
  return {
    clientId: created.id,
    warnings: [`${WARNING_CLIENT_CREATED}:${normalized}`],
  };
}
