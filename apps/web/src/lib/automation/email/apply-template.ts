/**
 * Aplica o template de e-mail personalizado (EmailTemplate) de um evento sobre
 * o e-mail padrão gerado pelo builder (ITEM 3).
 *
 * Integração mínima nos pontos de envio:
 *
 *   const email = await applyEmailTemplate("PAYMENT_FORECAST", vars, buildX(input));
 *
 * Política — FAIL-OPEN, sempre:
 *  - sem banco, sem linha, linha inativa, evento sem e-mail → e-mail padrão;
 *  - qualquer erro (tabela ausente, render quebrado, assunto vazio) → padrão.
 * Um template mal configurado nunca impede um e-mail operacional de sair.
 *
 * Cache: as linhas ficam em memória por processo com TTL curto, para não
 * consultar o banco a cada destinatário de um job. Salvar/restaurar na tela
 * invalida o cache do processo que atendeu a action; os demais expiram no TTL.
 */
import { prisma } from "@jumpflow/database";
import { isDatabaseConfigured } from "@/lib/db/config";
import type { NotificationFragment } from "../notifications/dispatch";
import { blockKeysOf, getEmailTemplateDefinition } from "./template-registry";
import { renderTemplateEmail, type TemplateVars } from "./template-renderer";
import { commonTemplateVars, joinBlocks } from "./template-vars";
import type { BuiltEmail } from "./templates";

export interface StoredEmailTemplate {
  subject: string;
  body: string;
}

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: StoredEmailTemplate | null }>();

export function invalidateEmailTemplateCache(event?: string): void {
  if (event) cache.delete(event);
  else cache.clear();
}

/** Template ATIVO do evento, ou null. Nunca lança. */
export async function loadActiveEmailTemplate(
  event: string,
): Promise<StoredEmailTemplate | null> {
  if (!isDatabaseConfigured()) return null;
  const hit = cache.get(event);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  let value: StoredEmailTemplate | null = null;
  try {
    const row = await prisma.emailTemplate.findUnique({
      // `event` é validado pelo registro antes de chegar aqui.
      where: { event: event as never },
      select: { subject: true, body: true, active: true },
    });
    value = row && row.active ? { subject: row.subject, body: row.body } : null;
  } catch (error) {
    console.error("[email-template] load failed; using default", { event, error });
    value = null;
  }
  cache.set(event, { at: Date.now(), value });
  return value;
}

/**
 * Renderiza um template armazenado. Retorna null quando o resultado não é
 * utilizável (evento sem e-mail, assunto vazio, erro) — o chamador usa o padrão.
 */
export function renderStoredTemplate(
  event: string,
  stored: StoredEmailTemplate,
  vars: TemplateVars,
): BuiltEmail | null {
  const def = getEmailTemplateDefinition(event);
  if (!def) return null;
  try {
    const rendered = renderTemplateEmail({
      subject: stored.subject,
      body: stored.body,
      vars,
      blockKeys: blockKeysOf(def),
      defaultTitle: def.defaultTitle,
      brand: def.brand,
    });
    if (!rendered.subject) return null;
    return rendered;
  } catch (error) {
    console.error("[email-template] render failed; using default", { event, error });
    return null;
  }
}

/** Substitui assunto/corpo pelo template personalizado ativo, se houver. */
export async function applyEmailTemplate(
  event: string,
  vars: TemplateVars,
  defaultEmail: BuiltEmail,
): Promise<BuiltEmail> {
  try {
    const stored = await loadActiveEmailTemplate(event);
    if (!stored) return defaultEmail;
    return renderStoredTemplate(event, stored, vars) ?? defaultEmail;
  } catch {
    return defaultEmail;
  }
}

/**
 * Variáveis de um fragmento sem `templateVars` para eventos de conteúdo
 * genérico (SLA, liberação do DP): título original + blocos prontos.
 */
export function genericFragmentTemplateVars(fragment: NotificationFragment): TemplateVars | null {
  if (!fragment.blocks || fragment.blocks.length === 0) return null;
  return {
    ...commonTemplateVars(),
    "destinatario.nome": fragment.recipient.name ?? "",
    titulo: fragment.title,
    conteudo: joinBlocks(...fragment.blocks),
  };
}

/**
 * Versão para o motor de notificações (emit.ts). Muta os fragmentos no lugar:
 *  - com `templateVars` + `prebuilt` → template do evento sobre o padrão;
 *  - só com `blocks` (eventos de conteúdo genérico) → {{titulo}} + {{conteudo}}.
 * O resultado vira `prebuilt` (envio individual) e o assunto vira o `title`.
 */
export async function applyEmailTemplateToFragments(
  event: string,
  fragments: NotificationFragment[],
): Promise<void> {
  try {
    const def = getEmailTemplateDefinition(event);
    if (!def) return;
    const varsFor = (f: NotificationFragment): TemplateVars | null => {
      if (f.recipient.channel !== "EMAIL") return null;
      if (f.templateVars && f.prebuilt) return f.templateVars;
      if (def.genericContent && !f.prebuilt) return genericFragmentTemplateVars(f);
      return null;
    };
    if (!fragments.some((f) => varsFor(f))) return;
    const stored = await loadActiveEmailTemplate(event);
    if (!stored) return;
    for (const fragment of fragments) {
      const vars = varsFor(fragment);
      if (!vars) continue;
      const rendered = renderStoredTemplate(event, stored, vars);
      if (!rendered) continue;
      fragment.prebuilt = rendered;
      fragment.title = rendered.subject;
    }
  } catch (error) {
    console.error("[email-template] apply to fragments failed", { event, error });
  }
}
