import type { FeedbackTone } from "@/components/ui/Feedback";
import type { CloseOperationResult } from "@/app/app/operacao/fechamento/actions";

/**
 * Resume o efeito de pagamentos disparado por `closeOperation` numa única
 * mensagem para o banner de feedback existente (uma linha por assunto). O
 * fechamento em si já teve sucesso quando esta função é chamada — aqui só
 * surfamos o resultado da geração/reconciliação de pagamentos.
 *
 * Tom (o banner só tem uma cor): success → info → warning, do menos ao mais
 * severo. `lockedDivergent` e `paymentsError` exigem ação humana do Financeiro,
 * então elevam para warning; `skippedNoCompensation` é informativo (info).
 */
export function buildCloseOperationFeedback(
  baseMessage: string,
  data: CloseOperationResult,
): { tone: FeedbackTone; text: string } {
  const lines: string[] = [baseMessage];
  // 0 = success, 1 = info, 2 = warning
  let severity = 0;

  const payments = data.payments;
  if (payments) {
    const {
      created,
      refreshed,
      lockedDivergent,
      skippedNoCompensation,
      skippedNotPayable,
    } = payments;

    const generated: string[] = [];
    if (created > 0) {
      generated.push(
        `${created} pagamento${created > 1 ? "s" : ""} gerado${
          created > 1 ? "s" : ""
        }`,
      );
    }
    if (refreshed > 0) {
      generated.push(`${refreshed} atualizado${refreshed > 1 ? "s" : ""}`);
    }
    if (generated.length > 0) {
      lines.push(`${generated.join(", ")}.`);
    }

    if (lockedDivergent.length > 0) {
      severity = Math.max(severity, 2);
      const names = lockedDivergent.map((l) => l.name).join(", ");
      const n = lockedDivergent.length;
      lines.push(
        `${n} pagamento${n > 1 ? "s" : ""} já em processamento não ${
          n > 1 ? "foram atualizados" : "foi atualizado"
        } e pode${n > 1 ? "m" : ""} estar desatualizado${
          n > 1 ? "s" : ""
        }: ${names}.`,
      );
    }

    if (skippedNoCompensation.length > 0) {
      severity = Math.max(severity, 1);
      const names = skippedNoCompensation.map((s) => s.name).join(", ");
      const n = skippedNoCompensation.length;
      lines.push(
        `${n} consultor${n > 1 ? "es" : ""} sem remuneração cadastrada não ${
          n > 1 ? "geraram" : "gerou"
        } pagamento: ${names}.`,
      );
    }

    // CLT puro é folha e não gera pagamento neste fluxo — informativo (info).
    if (skippedNotPayable.length > 0) {
      severity = Math.max(severity, 1);
      const names = skippedNotPayable.map((s) => s.name).join(", ");
      const n = skippedNotPayable.length;
      lines.push(
        `${n} consultor${n > 1 ? "es" : ""} CLT não ${
          n > 1 ? "geram" : "gera"
        } pagamento aqui: ${names}.`,
      );
    }
  }

  if (data.paymentsError) {
    severity = Math.max(severity, 2);
    lines.push(
      'O fechamento foi concluído, mas a geração de pagamentos falhou. Tente "Gerar pagamentos" manualmente em Pagamentos.',
    );
  }

  const tone: FeedbackTone =
    severity === 2 ? "warning" : severity === 1 ? "info" : "success";

  return { tone, text: lines.join(" ") };
}
