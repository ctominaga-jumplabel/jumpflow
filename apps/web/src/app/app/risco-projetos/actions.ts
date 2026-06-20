"use server";

import { z } from "zod";
import { prisma } from "@jumpflow/database";
import { requireRole } from "@/lib/auth/guards";
import {
  PROJECT_RISK_READ_ROLES,
  resolveProjectRiskScope,
} from "@/lib/project-risk/visibility";
import { resolveDbUser } from "@/lib/db/users";
import { isDatabaseConfigured } from "@/lib/db/config";
import { isAiRiskSentimentEnabled } from "@/lib/ai/flags";
import { getAiTextProvider, AI_MODELS } from "@/lib/ai/provider";
import { recordAiUsage } from "@/lib/ai/log";

/**
 * Server action para o SINAL DE SENTIMENTO por LLM da IA de Risco (§8.3). É um
 * sinal À PARTE, complementar: analisa textos livres (descrições de TimeEntry e
 * corpos de Feedback do projeto) e devolve um rótulo agregado de tom. NÃO altera
 * o nível determinístico GREEN/YELLOW/RED (decisão de governança, design §1.2) —
 * a UI o exibe ao lado, claramente marcado como gerado por IA.
 *
 * Atrás da flag NEXT_PUBLIC_AI_RISK_SENTIMENT; com o provider noop (default)
 * retorna `available: false` e a UI mostra "indisponível". Degradação graciosa:
 * qualquer falha → texto nulo, sem quebrar a tela. RBAC + escopo por linha são
 * checados aqui no servidor (PROJECT_MANAGER só do seu projeto).
 */

const sentimentSchema = z.object({
  projectId: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

export type RiskSentimentInput = z.infer<typeof sentimentSchema>;

export interface RiskSentimentResult {
  /** false quando a flag está off, o provider real não está configurado, ou sem texto. */
  available: boolean;
  /** Rótulo/texto agregado de sentimento, ou null (degradação graciosa). */
  text: string | null;
  /** Quantos comentários foram considerados (transparência). */
  sampleSize: number;
}

const UNAVAILABLE: RiskSentimentResult = {
  available: false,
  text: null,
  sampleSize: 0,
};

/** Máximo de comentários enviados ao LLM (controle de custo/latência). */
const MAX_COMMENTS = 30;

export async function analyzeProjectSentiment(
  rawInput: unknown,
): Promise<RiskSentimentResult> {
  const user = await requireRole(PROJECT_RISK_READ_ROLES);

  if (!isAiRiskSentimentEnabled()) {
    return UNAVAILABLE;
  }

  const parsed = sentimentSchema.safeParse(rawInput);
  if (!parsed.success) {
    return UNAVAILABLE;
  }
  const { projectId } = parsed.data;

  if (!isDatabaseConfigured()) {
    // Sem DB não há comentários reais; o núcleo determinístico (mock) já cobre a tela.
    return UNAVAILABLE;
  }

  // Escopo por linha no servidor: PROJECT_MANAGER só do projeto que gerencia.
  const broadOrFinance = user.roles.some((r) =>
    ["ADMIN", "AREA_MANAGER", "FINANCE"].includes(r),
  );
  const scope = broadOrFinance
    ? resolveProjectRiskScope({ roles: user.roles, userId: null })
    : resolveProjectRiskScope({
        roles: user.roles,
        userId: (await resolveDbUser(user))?.id ?? null,
      });

  if (scope.kind === "none") return UNAVAILABLE;
  if (scope.kind === "manager") {
    const owned = await prisma.project.findFirst({
      where: { id: projectId, managerUserId: scope.managerUserId },
      select: { id: true },
    });
    if (!owned) return UNAVAILABLE; // fora do escopo — nunca vaza outro projeto
  }

  // Coleta comentários: descrições de apontamentos + corpos de feedback do projeto.
  const [entries, feedbacks] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { projectId, description: { not: null } },
      orderBy: { date: "desc" },
      take: MAX_COMMENTS,
      select: { description: true },
    }),
    prisma.feedback.findMany({
      where: { relatedProjectId: projectId },
      orderBy: { createdAt: "desc" },
      take: MAX_COMMENTS,
      select: { body: true },
    }),
  ]);

  const comments = [
    ...entries.map((e) => e.description ?? ""),
    ...feedbacks.map((f) => f.body),
  ]
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .slice(0, MAX_COMMENTS);

  if (comments.length === 0) {
    return { available: false, text: null, sampleSize: 0 };
  }

  const provider = getAiTextProvider();
  const prompt = [
    "Analise o TOM agregado dos comentários abaixo (descrições de apontamentos e feedbacks de um projeto).",
    "Responda em 1-2 frases em português, classificando o tom predominante (positivo / neutro / negativo) e citando um indício. NÃO invente fatos.",
    "Comentários:",
    ...comments.map((c, i) => `${i + 1}. ${c}`),
  ].join("\n");

  let text: string | null = null;
  try {
    text = await provider.complete(prompt, {
      model: AI_MODELS.HAIKU,
      maxTokens: 160,
      system:
        "Você faz análise de sentimento agregada de comentários de um projeto, em português, de forma objetiva. É um sinal COMPLEMENTAR para um humano ponderar — não decide o risco. Use apenas o texto fornecido.",
      entityType: "PROJECT_RISK_SENTIMENT",
      entityId: projectId,
    });
    await recordAiUsage({
      feature: "RISK_SENTIMENT",
      model: AI_MODELS.HAIKU,
      entityType: "PROJECT_RISK_SENTIMENT",
      entityId: projectId,
      status: text === null ? "FAILED" : "SUCCESS",
    });
  } catch {
    // Degradação graciosa: nunca quebra a tela por causa da IA.
    text = null;
  }

  // Provider noop devolve null → sinal indisponível mesmo com flag on.
  return {
    available: text !== null,
    text,
    sampleSize: comments.length,
  };
}
