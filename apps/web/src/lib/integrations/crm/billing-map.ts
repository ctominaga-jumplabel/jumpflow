import type { PrismaClient } from "@jumpflow/database";

/**
 * CRM -> JumpFlow billing type de/para (FASE 1, ingestao).
 *
 * Principio: NAO acoplar por enum/chargeType do CRM. Resolvemos pelo NOME do
 * BillingType no catalogo do JumpFlow (`BillingType.name` e @unique). Os nomes
 * abaixo estao semeados em `packages/database/prisma/seed.mjs`.
 *
 * Modulo PURO: sem "use server", sem efeitos, sem instancia global de Prisma.
 * O client Prisma e injetado como primeiro parametro para permitir testes.
 */

/** Warning: o `crmBillingModel` recebido nao tem de/para conhecido. */
export const WARNING_BILLING_MODEL_UNMAPPED = "BILLING_MODEL_UNMAPPED";
/** Warning: o nome mapeado nao existe no catalogo de BillingType. */
export const WARNING_BILLING_TYPE_NOT_FOUND = "BILLING_TYPE_NOT_FOUND";

/**
 * De/para do modelo de faturamento do CRM para o NOME do BillingType.
 * Chaves normalizadas (uppercase + trim). Ver secao D10 de
 * `respostas-jumpflow-fase1.md`.
 */
export const CRM_BILLING_MODEL_TO_BILLING_TYPE_NAME: Record<string, string> = {
  FIXED: "Preço por projeto",
  RECURRING: "Mensalidade fixa",
  VARIABLE: "Hora trabalhada",
  HYBRID: "Hora + Fixo",
  // OTHER e qualquer valor desconhecido/ausente => null + warning (Financeiro
  // ajusta na tela). Intencionalmente NAO mapeado aqui.
};

/** Normaliza o valor do CRM: trim + uppercase (case-insensitive). */
function normalizeCrmBillingModel(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export interface ResolveBillingTypeResult {
  billingTypeId: string | null;
  warning: string | null;
}

/**
 * Resolve o `billingTypeId` do JumpFlow a partir do `crmBillingModel`.
 *
 * - OTHER / desconhecido / ausente => { null, "BILLING_MODEL_UNMAPPED:<valor recebido>" }
 * - mapeado mas nome ausente no catalogo => { null, "BILLING_TYPE_NOT_FOUND:<nome>" }
 * - sucesso => { billingTypeId, null }
 *
 * O warning para modelo nao mapeado ecoa o valor ORIGINAL recebido (sem
 * normalizar) para facilitar diagnostico no Financeiro.
 */
export async function resolveBillingTypeId(
  prisma: Pick<PrismaClient, "billingType">,
  crmBillingModel: string | null | undefined,
): Promise<ResolveBillingTypeResult> {
  const normalized = normalizeCrmBillingModel(crmBillingModel);
  const billingTypeName = CRM_BILLING_MODEL_TO_BILLING_TYPE_NAME[normalized];

  if (!billingTypeName) {
    const received = crmBillingModel ?? "";
    return {
      billingTypeId: null,
      warning: `${WARNING_BILLING_MODEL_UNMAPPED}:${received}`,
    };
  }

  const billingType = await prisma.billingType.findUnique({
    where: { name: billingTypeName },
    select: { id: true },
  });

  if (!billingType) {
    return {
      billingTypeId: null,
      warning: `${WARNING_BILLING_TYPE_NOT_FOUND}:${billingTypeName}`,
    };
  }

  return { billingTypeId: billingType.id, warning: null };
}
