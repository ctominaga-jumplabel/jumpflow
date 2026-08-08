import { describe, expect, it } from "vitest";

/**
 * `buildCloseOperationFeedback` — resume o efeito de pagamentos disparado por
 * `closeOperation` numa única mensagem + tom para o banner de feedback.
 *
 * Tom (uma cor só): success < info < warning (do menos ao mais severo).
 *  - lockedDivergent / paymentsError => warning (exigem ação humana).
 *  - skippedNoCompensation => info.
 *  - só sucesso (ou payments ausente) => success.
 *
 * Puro: sem I/O. Os imports de tipo são erased em runtime.
 */

import { buildCloseOperationFeedback } from "@/lib/operations/close-feedback";
import type { CloseOperationResult } from "@/app/app/operacao/fechamento/actions";

const BASE = "Operacao fechada.";

function payments(
  over: Partial<CloseOperationResult["payments"] & object> = {},
): CloseOperationResult["payments"] {
  return {
    created: 0,
    refreshed: 0,
    lockedDivergent: [],
    skippedNoCompensation: [],
    skippedNotPayable: [],
    ...over,
  };
}

describe("buildCloseOperationFeedback", () => {
  it("payments ausente => success com a mensagem base intacta", () => {
    const result = buildCloseOperationFeedback(BASE, { id: "op1" });
    expect(result.tone).toBe("success");
    expect(result.text).toBe(BASE);
  });

  it("payments todos zerados => success, sem linha de geração", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      payments: payments(),
    });
    expect(result.tone).toBe("success");
    expect(result.text).toBe(BASE);
  });

  it("só skippedNoCompensation => info + nomes", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      payments: payments({
        skippedNoCompensation: [{ consultantId: "c1", name: "Ana" }],
      }),
    });
    expect(result.tone).toBe("info");
    expect(result.text).toContain("Ana");
    expect(result.text).toContain("1 consultor sem remuneração cadastrada");
    expect(result.text).toContain("gerou");
  });

  it("lockedDivergent => warning + nomes", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      payments: payments({
        lockedDivergent: [
          {
            consultantId: "c1",
            name: "Bruno",
            status: "WAITING_FOR_INVOICE",
          },
        ],
      }),
    });
    expect(result.tone).toBe("warning");
    expect(result.text).toContain("Bruno");
    expect(result.text).toContain("1 pagamento já em processamento");
    expect(result.text).toContain("não foi atualizado");
  });

  it("paymentsError => warning com instrução de gerar manual", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      paymentsError: "boom",
    });
    expect(result.tone).toBe("warning");
    expect(result.text).toContain("geração de pagamentos falhou");
    expect(result.text).toContain('"Gerar pagamentos"');
  });

  it("created + refreshed => texto pluralizado correto (success)", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      payments: payments({ created: 2, refreshed: 1 }),
    });
    expect(result.tone).toBe("success");
    // 2 => plural "gerados"; 1 => singular "atualizado".
    expect(result.text).toContain("2 pagamentos gerados");
    expect(result.text).toContain("1 atualizado");
  });

  it("created 1 => singular; refreshed 3 => plural", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      payments: payments({ created: 1, refreshed: 3 }),
    });
    expect(result.text).toContain("1 pagamento gerado");
    expect(result.text).toContain("3 atualizados");
  });

  it("severidade sobe ao mais severo: created + skipped + lockedDivergent => warning", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      payments: payments({
        created: 1,
        skippedNoCompensation: [{ consultantId: "c1", name: "Ana" }],
        lockedDivergent: [
          {
            consultantId: "c2",
            name: "Bruno",
            status: "APPROVED_FOR_PAYMENT",
          },
        ],
      }),
    });
    expect(result.tone).toBe("warning");
    // Contém as três seções.
    expect(result.text).toContain("1 pagamento gerado");
    expect(result.text).toContain("Ana");
    expect(result.text).toContain("Bruno");
  });

  it("lockedDivergent com 2 nomes => plural (foram atualizados / desatualizados)", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      payments: payments({
        lockedDivergent: [
          { consultantId: "c1", name: "Ana", status: "PAID" },
          { consultantId: "c2", name: "Bruno", status: "PAID" },
        ],
      }),
    });
    expect(result.tone).toBe("warning");
    expect(result.text).toContain("2 pagamentos já em processamento");
    expect(result.text).toContain("não foram atualizados");
    expect(result.text).toContain("Ana, Bruno");
  });

  it("skippedNotPayable (CLT puro) => info + nome, sem valores", () => {
    const result = buildCloseOperationFeedback(BASE, {
      id: "op1",
      payments: payments({
        created: 1,
        skippedNotPayable: [
          { consultantId: "c9", name: "Carla", contractType: "CLT" },
        ],
      }),
    });
    expect(result.tone).toBe("info");
    expect(result.text).toContain("Carla");
    expect(result.text).toContain("1 consultor CLT não gera pagamento aqui");
    // Sanitizado: nenhum valor em R$ vaza para o feedback.
    expect(result.text).not.toMatch(/\d+[.,]\d{2}/);
  });
});
