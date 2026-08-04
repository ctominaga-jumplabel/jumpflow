import JSZip from "jszip";
import { requireUser } from "@/lib/auth/guards";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { resolveDbUser } from "@/lib/db/users";
import type { ReceiptOwnerScope } from "@/lib/db/expenses";
import {
  EXPENSE_RECEIPTS_BUCKET,
  getStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";

export const dynamic = "force-dynamic";

/**
 * P17 (Onda 3): download em massa de comprovantes. Recebe os ids das despesas
 * selecionadas (?ids=a,b,c), busca cada anexo do storage e monta um ZIP.
 * RBAC: o Financeiro (FINANCIAL_ROLES) baixa QUALQUER comprovante; qualquer
 * usuário autenticado pode baixar os PRÓPRIOS comprovantes em massa (na tela
 * Despesas) — nesse caso a busca é escopada ao dono, então ninguém enumera
 * comprovante alheio por id. Degrada honesto com NO_STORAGE quando o storage não
 * está configurado. Cada arquivo é nomeado por data-consultor-descrição para
 * leitura clara. O download em massa é auditado.
 */
function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: code, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Slug seguro para nome de arquivo (ASCII alfanumérico + hífen). */
function slug(value: string, max = 40): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, max)
      .toLowerCase() || "despesa"
  );
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot) : "";
}

export async function GET(request: Request) {
  // Autenticação obrigatória. O ESCOPO (todos vs. só os próprios) é resolvido
  // abaixo pelo papel — o Financeiro baixa qualquer um; os demais, só os seus.
  const user = await requireUser();
  if (!isDatabaseConfigured()) {
    return jsonError("NO_DATABASE", "Banco de dados não configurado.", 503);
  }
  if (!isStorageConfigured()) {
    return jsonError(
      "NO_STORAGE",
      "Anexos indisponíveis: storage não configurado.",
      409,
    );
  }

  // Financeiro (FINANCIAL_ROLES) pode baixar qualquer comprovante; qualquer
  // outro usuário só os próprios — escopo aplicado na query (anti-enumeração).
  const privileged = hasRole(user, FINANCIAL_ROLES);
  const dbUser = await resolveDbUser(user);
  let scope: ReceiptOwnerScope = {};
  if (!privileged) {
    if (dbUser) {
      scope = { ownerUserId: dbUser.id };
    } else if (isDevAuthEnabled()) {
      scope = { ownerEmail: user.email.trim().toLowerCase() };
    } else {
      return jsonError(
        "FORBIDDEN",
        "Você não tem acesso a estes comprovantes.",
        403,
      );
    }
  }

  const idsParam = new URL(request.url).searchParams.get("ids") ?? "";
  const ids = [
    ...new Set(
      idsParam
        .split(",")
        .map((v) => v.trim())
        .filter((v) => v.length > 0),
    ),
  ].slice(0, 500);
  if (ids.length === 0) {
    return jsonError("INVALID_INPUT", "Nenhuma despesa selecionada.", 400);
  }

  const { listReceiptsByIds } = await import("@/lib/db/expenses");
  const rows = await listReceiptsByIds(ids, scope);
  if (rows.length === 0) {
    return jsonError(
      "NOT_FOUND",
      "Nenhum comprovante encontrado para a seleção.",
      404,
    );
  }

  const provider = getStorageProvider(EXPENSE_RECEIPTS_BUCKET);
  if (!provider) {
    return jsonError(
      "NO_STORAGE",
      "Anexos indisponíveis: storage não configurado.",
      409,
    );
  }

  const zip = new JSZip();
  const usedNames = new Set<string>();
  let added = 0;
  const failed: string[] = [];

  for (const row of rows) {
    try {
      const url = await provider.getSignedUrl(row.storageKey, 300);
      const response = await fetch(url);
      if (!response.ok) {
        failed.push(row.expenseId);
        continue;
      }
      const bytes = await response.arrayBuffer();
      const base = `${row.date}-${slug(row.consultantName, 24)}-${slug(row.description, 32)}`;
      let name = `${base}${extensionOf(row.fileName)}`;
      let n = 2;
      while (usedNames.has(name)) {
        name = `${base}-${n}${extensionOf(row.fileName)}`;
        n += 1;
      }
      usedNames.add(name);
      zip.file(name, bytes);
      added += 1;
    } catch (error) {
      console.error("[despesas] bulk receipt fetch failed", row.expenseId, error);
      failed.push(row.expenseId);
    }
  }

  // Audita a tentativa SEMPRE — inclusive quando nenhum comprovante baixou
  // (antes o caso de falha total retornava 502 sem deixar rastro).
  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "Expense",
    entityId: "bulk",
    action: "EXPENSE_RECEIPTS_BULK_DOWNLOAD",
    after: {
      scope: privileged ? "finance" : "owner",
      requested: ids.length,
      downloaded: added,
      failed: failed.length,
      expenseIds: rows.map((r) => r.expenseId),
    },
  });

  if (added === 0) {
    return jsonError(
      "UNEXPECTED",
      "Não foi possível baixar os comprovantes. Tente novamente.",
      502,
    );
  }

  const content = await zip.generateAsync({ type: "uint8array" });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(content as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="comprovantes_${stamp}.zip"`,
      // Sinaliza falhas parciais ao cliente (comprovantes que não baixaram).
      "x-failed-count": String(failed.length),
    },
  });
}
