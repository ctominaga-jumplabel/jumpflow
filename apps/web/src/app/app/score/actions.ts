"use server";

import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { CONSULTANT_SCORE_READ_ROLES } from "@/lib/consultant-score/visibility";
import { isAiScoreNarrativeEnabled } from "@/lib/ai/flags";
import { getAiTextProvider, AI_MODELS } from "@/lib/ai/provider";
import { recordAiUsage } from "@/lib/ai/log";

/**
 * Server action para a NARRATIVA por LLM do Score do Consultor (§8.4). RECEBE o
 * breakdown JÁ CALCULADO pela engine determinística e pede ao provider uma
 * narrativa em linguagem natural — NUNCA recalcula o score nem reordena fatores.
 * Atrás da flag NEXT_PUBLIC_AI_SCORE_NARRATIVE; com o provider noop (default)
 * retorna `available: false` e a UI mostra "indisponível". Degradação graciosa:
 * qualquer falha → texto nulo, sem quebrar a tela. O score segue determinístico.
 */

const narrateSchema = z.object({
  consultantName: z.string().trim().min(1).max(200),
  score: z.number().int().min(0).max(100),
  trend: z.enum(["UP", "DOWN", "STABLE", "UNKNOWN"]),
  factors: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        score01: z.number().min(0).max(1),
        available: z.boolean(),
        detail: z.string().trim().max(300),
      }),
    )
    .max(8),
});

export type NarrateScoreInput = z.infer<typeof narrateSchema>;

export interface NarrateScoreResult {
  /** false quando a flag está off ou o provider real não está configurado. */
  available: boolean;
  /** Texto gerado, ou null (degradação graciosa). */
  text: string | null;
}

const trendLabel: Record<NarrateScoreInput["trend"], string> = {
  UP: "em evolução frente ao ciclo anterior",
  DOWN: "em queda frente ao ciclo anterior",
  STABLE: "estável frente ao ciclo anterior",
  UNKNOWN: "sem histórico de comparação",
};

export async function narrateConsultantScore(
  rawInput: unknown,
): Promise<NarrateScoreResult> {
  await requireRole(CONSULTANT_SCORE_READ_ROLES);

  if (!isAiScoreNarrativeEnabled()) {
    return { available: false, text: null };
  }

  const parsed = narrateSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { available: false, text: null };
  }
  const input = parsed.data;

  const provider = getAiTextProvider();
  const factorsLines = input.factors
    .map(
      (f) =>
        `- ${f.label} (${Math.round(f.score01 * 100)}%${f.available ? "" : ", sem dado / neutro"}): ${f.detail}`,
    )
    .join("\n");
  const prompt = [
    `Consultor: ${input.consultantName} — score ${input.score}/100, ${trendLabel[input.trend]}.`,
    "Fatores já calculados (não recalcule o número, apenas explique em 2-3 frases, em português, destacando forças e oportunidades de evolução):",
    factorsLines,
  ].join("\n");

  let text: string | null = null;
  try {
    text = await provider.complete(prompt, {
      model: AI_MODELS.SONNET,
      maxTokens: 220,
      system:
        "Você explica, de forma objetiva e em português, o score de um consultor a partir dos fatores fornecidos, destacando pontos fortes e oportunidades de desenvolvimento. Não invente dados, não altere o score, não cite conteúdo sensível de feedback. A decisão sobre pessoas é sempre humana.",
      entityType: "CONSULTANT_SCORE",
    });
    await recordAiUsage({
      feature: "SCORE_NARRATIVE",
      model: AI_MODELS.SONNET,
      entityType: "CONSULTANT_SCORE",
      status: text === null ? "FAILED" : "SUCCESS",
    });
  } catch {
    // Degradação graciosa: nunca quebra a tela por causa da IA.
    text = null;
  }

  // Provider noop devolve null → narrativa indisponível mesmo com flag on.
  return { available: text !== null, text };
}
