"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { logout } from "@/lib/auth/actions";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { isDatabaseConfigured } from "@/lib/db/config";
import { recordAuditEvent } from "@/lib/db/audit";
import { CURRENT_TERMS_VERSION } from "@/lib/terms/terms";

/**
 * Server actions do gate de Termos de Uso (EP-M08).
 *
 * Autorizacao no servidor: ambas as actions exigem sessao (`requireUser`), pois
 * o aceite/recusa e vinculado ao usuario autenticado. O texto exibido e a versao
 * vinculada vem SEMPRE do servidor (`CURRENT_TERMS_VERSION`), nunca de input do
 * cliente — nada e confiado ao formulario.
 */

/**
 * Aceita a versao vigente dos Termos. Idempotente (upsert por userId+versao),
 * audita `TERMS_ACCEPTED` e redireciona para `/app`.
 *
 * Em dev mode / sem banco nao ha onde persistir; o gate ja e pulado nesses
 * modos, entao apenas seguimos para `/app` (sem gravar/auditar em banco).
 */
export async function acceptTerms() {
  const user = await requireUser();

  if (!isDevAuthEnabled() && isDatabaseConfigured()) {
    const { acceptCurrentTerms } = await import("@/lib/db/terms");
    const acceptance = await acceptCurrentTerms(user.id);
    await recordAuditEvent({
      actorUserId: user.id,
      entityType: "TermsAcceptance",
      entityId: acceptance.id,
      action: "TERMS_ACCEPTED",
      after: { version: CURRENT_TERMS_VERSION },
    });
  }

  redirect("/app");
}

/**
 * Recusa os Termos: audita `TERMS_DECLINED` e desconecta o usuario (mesma
 * `logout` de `lib/auth/actions`), que redireciona para `/login`. Sem aceite,
 * o gate mantem o usuario bloqueado no proximo acesso.
 *
 * `logout` lanca o redirect (NEXT_REDIRECT) para `/login`.
 */
export async function declineTerms() {
  const user = await requireUser();

  if (!isDevAuthEnabled() && isDatabaseConfigured()) {
    await recordAuditEvent({
      actorUserId: user.id,
      entityType: "TermsAcceptance",
      entityId: user.id,
      action: "TERMS_DECLINED",
      after: { version: CURRENT_TERMS_VERSION },
    });
  }

  await logout();
}
