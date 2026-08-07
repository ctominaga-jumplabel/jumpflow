import { requireUser } from "@/lib/auth/guards";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { recordAuditEvent } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  getInvoiceAttachmentForDownload,
  type InvoiceAttachmentOwnerScope,
} from "@/lib/db/payments";
import { resolveDbUser } from "@/lib/db/users";
import { getStorageProvider, isStorageConfigured } from "@/lib/storage/provider";

export const dynamic = "force-dynamic";

/**
 * Melhoria #3: download da NF do consultor. Recebe o id do anexo (?id=...),
 * resolve uma URL assinada de curta duração e redireciona.
 *
 * RBAC (mesmo padrão anti-enumeração do download de comprovantes de despesa):
 * o Financeiro (FINANCIAL_ROLES) baixa QUALQUER NF; o consultor só as PRÓPRIAS
 * — nesse caso a busca é escopada ao dono (via `consultantPayment.consultant`),
 * então ninguém enumera NF alheia por id. Degrada honesto com NO_STORAGE quando
 * o storage não está configurado. O download é auditado.
 */
const SIGNED_URL_TTL_SECONDS = 300;

function jsonError(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: code, message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(request: Request) {
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

  const id = (new URL(request.url).searchParams.get("id") ?? "").trim();
  if (!id) {
    return jsonError("INVALID_INPUT", "Nenhuma NF informada.", 400);
  }

  // Financeiro baixa qualquer NF; os demais só as próprias — escopo aplicado na
  // query (anti-enumeração).
  const privileged = hasRole(user, FINANCIAL_ROLES);
  const dbUser = await resolveDbUser(user);
  let scope: InvoiceAttachmentOwnerScope = {};
  if (!privileged) {
    if (dbUser) {
      scope = { ownerUserId: dbUser.id };
    } else if (isDevAuthEnabled()) {
      scope = { ownerEmail: user.email.trim().toLowerCase() };
    } else {
      return jsonError("FORBIDDEN", "Você não tem acesso a esta NF.", 403);
    }
  }

  const attachment = await getInvoiceAttachmentForDownload(id, scope);
  if (!attachment) {
    return jsonError("NOT_FOUND", "NF não encontrada.", 404);
  }

  const provider = getStorageProvider(attachment.storageBucket);
  if (!provider) {
    return jsonError(
      "NO_STORAGE",
      "Anexos indisponíveis: storage não configurado.",
      409,
    );
  }

  let url: string;
  try {
    url = await provider.getSignedUrl(
      attachment.storageKey,
      SIGNED_URL_TTL_SECONDS,
    );
  } catch (error) {
    console.error("[pagamentos] failed to sign invoice URL", error);
    return jsonError(
      "UNEXPECTED",
      "Não foi possível gerar o link da NF. Tente novamente.",
      502,
    );
  }

  await recordAuditEvent({
    actorUserId: dbUser?.id ?? null,
    entityType: "ConsultantPayment",
    entityId: attachment.consultantPaymentId,
    action: "CONSULTANT_PAYMENT_INVOICE_DOWNLOADED",
    after: {
      attachmentId: attachment.id,
      fileName: attachment.fileName,
      scope: privileged ? "finance" : "owner",
    },
  });

  // Redireciona para a URL assinada de curta duração (nunca persistida).
  return Response.redirect(url, 302);
}
