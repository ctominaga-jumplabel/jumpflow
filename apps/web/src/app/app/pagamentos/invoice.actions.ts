"use server";

import { revalidatePath } from "next/cache";
import { Prisma, prisma } from "@jumpflow/database";
import { z, type ZodType } from "zod";
import type { ActionResult, ErrorCode } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/guards";
import { isDevAuthEnabled } from "@/lib/auth/dev";
import { FINANCIAL_ROLES, hasRole } from "@/lib/auth/route-permissions";
import { buildAuditEventData } from "@/lib/db/audit";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { resolveDbUser } from "@/lib/db/users";
import {
  buildConsultantInvoiceKey,
  validateInvoiceFile,
} from "@/lib/storage/file-validation";
import type { ConsultantPaymentStatus } from "@/lib/payments/state-machine";
import {
  CONSULTANT_INVOICES_BUCKET,
  getConsultantInvoiceStorageProvider,
  isStorageConfigured,
} from "@/lib/storage/provider";

/**
 * Melhoria #3 — upload da NF do consultor (self-service do consultor +
 * Financeiro). Ação separada do resto de Pagamentos porque precisa de storage
 * (o arquivo) e de escopo por dono. Um pagamento pode ter várias NFs anexadas.
 *
 * RBAC: o Financeiro (FINANCIAL_ROLES) anexa em QUALQUER pagamento; o consultor
 * só no PRÓPRIO (o vínculo é resolvido pelo usuário logado, nunca pelo cliente).
 * Só PJ/CLT_FLEX passam por NF (CLT puro é folha).
 */

const PAGAMENTOS_PATH = "/app/pagamentos";

/**
 * Estados em que o CONSULTOR (dono) ainda pode anexar/alterar a NF e o valor
 * declarado. A partir de INVOICE_VALIDATED o pagamento é imutável para o dono
 * (campo financeiro já validado/aprovado/pago). O Financeiro não sofre esse
 * bloqueio.
 */
const CONSULTANT_INVOICE_MUTABLE_STATUSES: ConsultantPaymentStatus[] = [
  "OPEN",
  "WAITING_FOR_INVOICE",
  "INVOICE_RECEIVED",
];

class ActionError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const uploadInputSchema = z.object({
  paymentId: z.string().min(1),
  // Valor declarado na NF: opcional (o consultor pode anexar sem digitar). Aceita
  // string vazia -> undefined. Positivo quando presente.
  invoiceAmount: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      const raw = typeof value === "number" ? value : value.trim();
      if (raw === "") return undefined;
      const parsed = typeof raw === "number" ? raw : Number(raw.replace(",", "."));
      return parsed;
    })
    .refine(
      (value) => value === undefined || (Number.isFinite(value) && value > 0),
      { message: "Valor da NF inválido." },
    ),
});

function ensureDatabase(): void {
  if (!isDatabaseConfigured()) {
    throw new ActionError("NO_DATABASE", "Banco de dados nao configurado.");
  }
}

function parseInput<T>(schema: ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Revise os dados informados.";
    throw new ActionError("INVALID_INPUT", message);
  }
  return result.data;
}

function toFailure(error: unknown): ActionResult<never> {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_")
  ) {
    throw error;
  }
  if (error instanceof ActionError) {
    return { ok: false, error: error.code, message: error.message };
  }
  console.error("[pagamentos] unexpected invoice action error", error);
  return {
    ok: false,
    error: "UNEXPECTED",
    message: "Nao foi possivel concluir a acao.",
  };
}

export interface UploadConsultantInvoiceResult {
  attachmentId: string;
  fileName: string;
  status: string;
  invoiceAmount: number | null;
}

/**
 * Anexa a NF de UM pagamento. Espera um FormData com:
 *  - `paymentId` (string, obrigatório)
 *  - `file` (File — PDF/XML/JPG/PNG/WEBP, máx. 10 MB)
 *  - `invoiceAmount` (string opcional — valor declarado na NF)
 *
 * Avança o status para NF Recebida SOMENTE quando o pagamento está em Aberto ou
 * Aguardando NF (update condicional por status, à prova de corrida); estados
 * posteriores não são forçados. Gera AuditEvent. Órfão de storage é limpo em
 * best-effort quando a transação de banco falha.
 */
export async function uploadConsultantInvoice(
  formData: FormData,
): Promise<ActionResult<UploadConsultantInvoiceResult>> {
  try {
    ensureDatabase();
    const user = await requireUser();
    // Degrade honesto: sem storage configurado, falha ANTES de tocar o banco.
    if (!isStorageConfigured()) {
      throw new ActionError(
        "NO_STORAGE",
        "Anexos indisponíveis: storage não configurado.",
      );
    }

    const parsed = parseInput(uploadInputSchema, {
      paymentId: formData.get("paymentId"),
      invoiceAmount: formData.get("invoiceAmount") ?? undefined,
    });

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ActionError("INVALID_FILE", "Nenhum arquivo enviado.");
    }
    const invalid = validateInvoiceFile({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (invalid) {
      throw new ActionError(invalid.code, invalid.message);
    }

    const payment = await prisma.consultantPayment.findUnique({
      where: { id: parsed.paymentId },
      select: {
        id: true,
        consultantId: true,
        status: true,
        contractType: true,
      },
    });
    if (!payment) {
      throw new ActionError("NOT_FOUND", "Pagamento nao encontrado.");
    }

    // Escopo PRIMEIRO (anti-enumeração): Financeiro anexa em qualquer um; o
    // consultor só no PRÓPRIO. A posse é resolvida ANTES de revelar QUALQUER
    // atributo do pagamento (inclusive contractType/status), para que um
    // pagamento alheio devolva sempre NOT_FOUND — nunca distinguindo CLT vs
    // PJ/inexistente. O vínculo vem do usuário logado, nunca do cliente.
    const privileged = hasRole(user, FINANCIAL_ROLES);
    if (!privileged) {
      const consultant = await getConsultantForUser(user);
      if (!consultant) {
        throw new ActionError(
          "NO_CONSULTANT",
          "Seu usuário não está vinculado a um consultor.",
        );
      }
      if (consultant.id !== payment.consultantId) {
        // Anti-enumeração: mesmo erro de "não encontrado" para pagamento alheio.
        throw new ActionError("NOT_FOUND", "Pagamento nao encontrado.");
      }
    }

    // Só PJ/CLT_FLEX passam por NF (CLT puro é folha e não recebe NF). Só
    // revelamos isso depois de confirmada a posse (acima).
    if (payment.contractType === "CLT") {
      throw new ActionError(
        "INVALID_INPUT",
        "Este contrato (CLT) não passa por nota fiscal.",
      );
    }

    // Guard de status: o consultor só pode anexar/alterar a NF (incl. o valor
    // declarado, campo financeiro) ATÉ NF Recebida. A partir de NF Validada o
    // pagamento é imutável para o dono. Pré-checagem para falha rápida; a
    // asserção à prova de corrida ocorre dentro da transação (updateMany
    // condicional que trava a linha). O Financeiro mantém a regra mais frouxa.
    if (
      !privileged &&
      !CONSULTANT_INVOICE_MUTABLE_STATUSES.includes(payment.status)
    ) {
      throw new ActionError(
        "ALREADY_DECIDED",
        "A NF não pode mais ser alterada: o pagamento já foi validado.",
      );
    }

    const dbUser = await resolveDbUser(user);
    // Em produção o FK precisa do id real; em dev-auth o id sintético não existe
    // no banco, então gravamos null (a coluna é nullable). Fora de dev exigimos.
    const uploadedByUserId = dbUser?.id ?? null;
    if (!uploadedByUserId && !isDevAuthEnabled()) {
      throw new ActionError(
        "FORBIDDEN",
        "Usuário não encontrado no banco de dados.",
      );
    }

    const provider = getConsultantInvoiceStorageProvider()!;
    const storageKey = buildConsultantInvoiceKey(payment.id, file.name);
    await provider.upload(storageKey, await file.arrayBuffer(), file.type);

    const now = new Date();
    let attachmentId = "";
    let nextStatus = payment.status;
    try {
      await prisma.$transaction(async (tx) => {
        // Asserção à prova de corrida (só consultor): condiciona TODA a mutação
        // ao pagamento ainda estar em estado mutável pelo dono. O updateMany
        // trava a linha até o commit, então uma validação concorrente não pode
        // interpor-se entre a leitura acima e as escritas abaixo. Financeiro não
        // passa por este guard (regra mais frouxa, como antes).
        if (!privileged) {
          const guard = await tx.consultantPayment.updateMany({
            where: {
              id: payment.id,
              status: { in: CONSULTANT_INVOICE_MUTABLE_STATUSES },
            },
            data: { updatedAt: now },
          });
          if (guard.count !== 1) {
            throw new ActionError(
              "ALREADY_DECIDED",
              "A NF não pode mais ser alterada: o pagamento já foi validado.",
            );
          }
        }

        const attachment = await tx.consultantInvoiceAttachment.create({
          data: {
            consultantPaymentId: payment.id,
            fileName: file.name,
            contentType: file.type,
            size: file.size,
            storageBucket: CONSULTANT_INVOICES_BUCKET,
            storageKey,
            uploadedByUserId,
          },
        });
        attachmentId = attachment.id;

        // Valor declarado da NF (quando informado) — gravado independentemente
        // do status. A comparação com o esperado vive no backend (melhoria #4).
        if (parsed.invoiceAmount !== undefined) {
          await tx.consultantPayment.update({
            where: { id: payment.id },
            data: { invoiceAmount: new Prisma.Decimal(parsed.invoiceAmount) },
          });
        }

        // Avança para NF Recebida SOMENTE a partir de Aberto/Aguardando NF
        // (update condicional por status, à prova de corrida). Estados
        // posteriores não são forçados.
        const advanced = await tx.consultantPayment.updateMany({
          where: {
            id: payment.id,
            status: { in: ["OPEN", "WAITING_FOR_INVOICE"] },
          },
          data: { status: "INVOICE_RECEIVED", invoiceReceivedAt: now },
        });
        if (advanced.count === 1) nextStatus = "INVOICE_RECEIVED";

        await tx.auditEvent.create({
          data: buildAuditEventData({
            actorUserId: uploadedByUserId,
            entityType: "ConsultantPayment",
            entityId: payment.id,
            action: "CONSULTANT_PAYMENT_INVOICE_UPLOADED",
            before: { status: payment.status },
            after: {
              status: nextStatus,
              attachmentId,
              fileName: file.name,
              size: file.size,
              invoiceAmount: parsed.invoiceAmount ?? null,
              scope: privileged ? "finance" : "owner",
            },
          }),
        });
      });
    } catch (error) {
      // O objeto já subiu; limpa best-effort para o bucket não acumular órfãos.
      try {
        await provider.delete(storageKey);
      } catch (cleanupError) {
        console.error(
          "[pagamentos] failed to clean up unreferenced invoice file",
          cleanupError,
        );
      }
      throw error;
    }

    revalidatePath(PAGAMENTOS_PATH);
    return {
      ok: true,
      data: {
        attachmentId,
        fileName: file.name,
        status: nextStatus,
        invoiceAmount: parsed.invoiceAmount ?? null,
      },
    };
  } catch (error) {
    return toFailure(error);
  }
}
