import { prisma } from "@jumpflow/database";
import { CURRENT_TERMS_VERSION } from "@/lib/terms/terms";

/**
 * Persistencia do aceite dos Termos de Uso (EP-M08).
 *
 * Callers devem guardar com `isDatabaseConfigured()` antes de invocar — estas
 * funcoes assumem que ha banco configurado.
 */

/**
 * Se o usuario ja aceitou a versao VIGENTE (`CURRENT_TERMS_VERSION`) dos Termos.
 *
 * Decisao de fail em erro de banco: retorna `true` (deixa PASSAR) e loga. Ao
 * contrario de RBAC, um erro transitorio de banco aqui NAO deve trancar TODOS
 * os usuarios fora da plataforma inteira (bloqueio total). Alem disso, com o
 * fail-open a acao de `acceptTerms` tambem falharia ao gravar, entao um usuario
 * legitimamente sem aceite continuaria bloqueado no proximo request com banco
 * saudavel — o fail-open apenas evita um lockout global durante indisponibilidade
 * de banco, sem abrir um caminho de burla persistente. Ver relatorio.
 */
export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  try {
    const acceptance = await prisma.termsAcceptance.findUnique({
      where: {
        userId_termsVersion: { userId, termsVersion: CURRENT_TERMS_VERSION },
      },
      select: { id: true },
    });
    return acceptance !== null;
  } catch (error) {
    console.error(
      "[terms] failed to read acceptance; failing open to avoid global lockout",
      error,
    );
    return true;
  }
}

/**
 * Registra o aceite da versao vigente de forma idempotente (upsert por
 * userId+termsVersion). Retorna o registro (id + data). Aceitar de novo a mesma
 * versao nao duplica nem move a data original.
 */
export async function acceptCurrentTerms(
  userId: string,
): Promise<{ id: string; acceptedAt: Date; termsVersion: string }> {
  const row = await prisma.termsAcceptance.upsert({
    where: {
      userId_termsVersion: { userId, termsVersion: CURRENT_TERMS_VERSION },
    },
    update: {},
    create: { userId, termsVersion: CURRENT_TERMS_VERSION },
    select: { id: true, acceptedAt: true, termsVersion: true },
  });
  return row;
}
