"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { ALLOCATION_AI_READ_ROLES } from "@/lib/allocation-ai/visibility";
import { isAiAllocationEnabled } from "@/lib/ai/flags";
import { getAiTextProvider, AI_MODELS } from "@/lib/ai/provider";
import { recordAiUsage } from "@/lib/ai/log";

/**
 * Server action para o enriquecimento LLM da IA de Alocação (§8.2). RECEBE os
 * fatores JÁ CALCULADOS pela engine determinística e pede ao provider uma
 * explicação em linguagem natural — NUNCA reordena nem recalcula o score. Atrás
 * da flag NEXT_PUBLIC_AI_ALLOCATION; com o provider noop (default) retorna
 * `available: false` e a UI mostra "indisponível". Degradação graciosa: qualquer
 * falha → texto nulo, sem quebrar a tela. A decisão de alocar segue humana.
 */

const explainSchema = z.object({
  consultantName: z.string().trim().min(1).max(200),
  score: z.number().int().min(0).max(100),
  factors: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        score01: z.number().min(0).max(1),
        detail: z.string().trim().max(300),
      }),
    )
    .max(8),
});

export type ExplainAllocationInput = z.infer<typeof explainSchema>;

export interface ExplainAllocationResult {
  /** false quando a flag está off ou o provider real não está configurado. */
  available: boolean;
  /** Texto gerado, ou null (degradação graciosa). */
  text: string | null;
}

export async function explainAllocationSuggestion(
  rawInput: unknown,
): Promise<ExplainAllocationResult> {
  await requireRole(ALLOCATION_AI_READ_ROLES);

  if (!isAiAllocationEnabled()) {
    return { available: false, text: null };
  }

  const parsed = explainSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { available: false, text: null };
  }
  const input = parsed.data;

  const provider = getAiTextProvider();
  const factorsLines = input.factors
    .map((f) => `- ${f.label} (${Math.round(f.score01 * 100)}%): ${f.detail}`)
    .join("\n");
  const prompt = [
    `Consultor: ${input.consultantName} — score de aderência ${input.score}/100.`,
    "Fatores já calculados (não recalcule, apenas explique em 2-3 frases, em português):",
    factorsLines,
  ].join("\n");

  let text: string | null = null;
  try {
    text = await provider.complete(prompt, {
      model: AI_MODELS.SONNET,
      maxTokens: 220,
      system:
        "Você explica, de forma objetiva e em português, por que um consultor é uma boa (ou fraca) sugestão para uma alocação, usando apenas os fatores fornecidos. Não invente dados nem altere o score. A decisão é humana.",
      entityType: "ALLOCATION_SUGGESTION",
    });
    await recordAiUsage({
      feature: "ALLOCATION_EXPLANATION",
      model: AI_MODELS.SONNET,
      entityType: "ALLOCATION_SUGGESTION",
      status: text === null ? "FAILED" : "SUCCESS",
    });
  } catch {
    // Degradação graciosa: nunca quebra a tela por causa da IA.
    text = null;
  }

  // Provider noop devolve null → enriquecimento indisponível mesmo com flag on.
  return { available: text !== null, text };
}
