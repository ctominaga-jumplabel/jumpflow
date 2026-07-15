import type { Prisma } from "@jumpflow/database";

/**
 * CRM -> JumpFlow job role de/para (FASE 1, ingestao / D6).
 *
 * O catalogo `JobRole` (name/slug @unique) e preenchido ON-DEMAND, no mesmo
 * espirito do `client-match.ts` para Client: match por `slug`; sem match, CRIA a
 * linha do catalogo + warning. Nunca bloqueia (um cargo faltante nao pode
 * derrubar a criacao do projeto/perfil). O `roleName` textual continua sendo a
 * fonte de exibicao/fallback no ProjectPlannedProfile.
 *
 * Recebe o `tx` (client transacional) para participar da transacao coesa da
 * ingestao. Modulo PURO: sem "use server", sem instancia global de Prisma.
 */

/** JobRole criado on-demand por nao haver match de slug nem de name. */
export const WARNING_JOBROLE_CREATED = "JOBROLE_CREATED";
/**
 * Ja existe um JobRole com o mesmo `name` (@unique) porem slug divergente
 * (ex.: criado antes com slug DERIVADO; agora o CRM manda slug EXPLICITO).
 * Reaproveitamos o cargo existente por name em vez de criar (o create violaria
 * `JobRole_name_key` com P2002 NAO-CONVERGENTE, ja que dentro do $transaction um
 * statement que falha aborta a tx inteira). Nunca bloqueia.
 */
export const WARNING_JOBROLE_SLUG_MISMATCH = "JOBROLE_SLUG_MISMATCH";
/** Nem slug nem name informados => sem alvo de cargo. */
export const WARNING_JOBROLE_MISSING = "JOBROLE_MISSING";

export interface ResolveJobRoleResult {
  jobRoleId: string | null;
  warning: string | null;
}

/** Subconjunto do client Prisma que este helper usa (tx satisfaz). */
type JobRoleDelegateHost = {
  jobRole: Prisma.TransactionClient["jobRole"];
};

/**
 * Deriva um slug a partir de um texto livre: minusculas, sem acento, espacos e
 * separadores colapsados em '-', bordas limpas.
 */
export function slugifyJobRole(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve (ou cria) o `JobRole.id` do JumpFlow a partir do cargo do CRM.
 *
 * - slug presente: match por slug; sem match => segue para o pre-check de name.
 * - slug ausente, name presente: deriva slug do name; mesma logica.
 * - sem match por slug, MAS existe JobRole com o mesmo name (@unique) =>
 *   reaproveita o id existente + JOBROLE_SLUG_MISMATCH (NAO cria; o create
 *   violaria JobRole_name_key com P2002 nao-convergente dentro da tx).
 * - sem match nem por slug nem por name => cria + JOBROLE_CREATED:<slug>.
 * - ambos ausentes => { null, "JOBROLE_MISSING" }.
 */
export async function resolveJobRoleId(
  tx: JobRoleDelegateHost,
  input: { slug?: string | null; name?: string | null },
): Promise<ResolveJobRoleResult> {
  const rawSlug = (input.slug ?? "").trim();
  const rawName = (input.name ?? "").trim();

  // Slug efetivo: o do CRM (normalizado) ou derivado do name.
  const slug = rawSlug ? slugifyJobRole(rawSlug) : slugifyJobRole(rawName);

  if (!slug) {
    return { jobRoleId: null, warning: WARNING_JOBROLE_MISSING };
  }

  const bySlug = await tx.jobRole.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (bySlug) {
    return { jobRoleId: bySlug.id, warning: null };
  }

  // Nome que usariamos no create (name e @unique). PRE-CHECK antes de criar:
  // se ja existe um cargo com esse name (slug divergente), reaproveita-o. Um
  // create+catch nao serve: dentro do $transaction o P2002 aborta a tx inteira.
  const name = rawName || slug;
  const byName = await tx.jobRole.findUnique({
    where: { name },
    select: { id: true },
  });
  if (byName) {
    return {
      jobRoleId: byName.id,
      warning: `${WARNING_JOBROLE_SLUG_MISMATCH}:${slug}`,
    };
  }

  const created = await tx.jobRole.create({
    data: { name, slug, active: true },
    select: { id: true },
  });
  return { jobRoleId: created.id, warning: `${WARNING_JOBROLE_CREATED}:${slug}` };
}
