import { z } from "zod";
import { parseIsoDateUtc } from "@/lib/timesheet/week";

/**
 * Server-side validation for the COE — Centro Operacional de Excelência.
 * Compartilhado pela página (search params), pela função de read e pelas server
 * actions. Puro (sem imports server-only), então também roda no cliente e nos
 * testes.
 */

// Entity ids são strings opacas (cuids ou ids legíveis de seed — ver
// lib/allocation-ai/schemas.ts). Validamos o formato, não o cuid.
const entityId = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identificador inválido.");

/**
 * Data ISO `yyyy-mm-dd` que existe no CALENDÁRIO, não só no formato: sem o
 * `refine`, `2026-99-99` passava no regex e virava `NaN` ao construir a janela —
 * todas as semanas ganhavam a MESMA chave (chave React duplicada) e a capacidade
 * lia sempre a mesma célula. Mesmo padrão de `lib/timesheet/schemas.ts`.
 */
const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .refine((value) => parseIsoDateUtc(value) !== null, {
    message: "Data inválida.",
  });

/** Número máximo de frentes paralelas de uma composição. */
export const MAX_SLOTS = 12;

/** Frentes genéricas quando o projeto não tem perfis planejados do CRM. */
export const DEFAULT_MANUAL_SLOTS = 3;

export const coeScopeSchema = z.enum(["COE", "ALL"]);

// ── Composição ──────────────────────────────────────────────────────────────

export const coeCompositionQuerySchema = z.object({
  /** Projeto-alvo: deriva frentes, skills, cliente e valor de venda. */
  projectId: entityId.optional().nullable(),
  /** Universo de candidatos. Default: só o núcleo curado. */
  scope: coeScopeSchema.default("COE"),
  /** Skills exigidas adicionais, além das derivadas do projeto. */
  skills: z.array(entityId).max(20).default([]),
  /** Início da janela de disponibilidade (ISO yyyy-mm-dd). */
  periodStart: isoDate.optional().nullable(),
  /** Semanas da janela de capacidade. */
  weeks: z.number().int().min(1).max(26).default(4),
  /**
   * Frentes genéricas quando o projeto não tem `ProjectPlannedProfile`. Ignorado
   * quando há perfis planejados — a demanda real do CRM sempre prevalece sobre
   * um número digitado na tela.
   */
  manualSlots: z
    .number()
    .int()
    .min(1)
    .max(MAX_SLOTS)
    .default(DEFAULT_MANUAL_SLOTS),
});

export type CoeCompositionQueryInput = z.infer<
  typeof coeCompositionQuerySchema
>;

// ── Curadoria do núcleo ─────────────────────────────────────────────────────

const focusArea = z
  .string()
  .trim()
  .min(2, "Informe a área de excelência.")
  .max(80, "Área de excelência muito longa.");

const note = z.string().trim().max(500).optional().nullable();

export const coeMemberAddSchema = z.object({
  consultantId: entityId,
  focusArea,
  note,
});

export const coeMemberUpdateSchema = z.object({
  id: entityId,
  focusArea,
  note,
});

/**
 * Sair do núcleo é desativar, não apagar: preserva o histórico de curadoria e
 * mantém íntegras as propostas que já citaram a pessoa.
 */
export const coeMemberSetActiveSchema = z.object({
  id: entityId,
  active: z.boolean(),
});

export type CoeMemberAddInput = z.infer<typeof coeMemberAddSchema>;
export type CoeMemberUpdateInput = z.infer<typeof coeMemberUpdateSchema>;
export type CoeMemberSetActiveInput = z.infer<typeof coeMemberSetActiveSchema>;

// ── Propostas de time ───────────────────────────────────────────────────────

const squadMemberSchema = z.object({
  consultantId: entityId,
  slotKey: z.string().trim().min(1).max(80),
  slotLabel: z.string().trim().min(1).max(120),
  /** Score COMPOSTO do slot (0..100). Nunca carrega custo/margem. */
  slotScore: z.number().int().min(0).max(100),
});

export const coeSquadSaveSchema = z
  .object({
    projectId: entityId,
    name: z.string().trim().min(2, "Dê um nome à proposta.").max(120),
    periodStart: isoDate.optional().nullable(),
    weeks: z.number().int().min(1).max(26).default(4),
    note,
    members: z
      .array(squadMemberSchema)
      .min(1, "Inclua ao menos um consultor na proposta.")
      .max(MAX_SLOTS),
  })
  // Duas travas de integridade que o banco também impõe (@@unique squadId+slotKey
  // e a regra de negócio de não repetir pessoa), aplicadas aqui para devolver
  // erro de validação em vez de erro de constraint.
  .refine(
    (v) => new Set(v.members.map((m) => m.slotKey)).size === v.members.length,
    { message: "Cada frente só pode ter uma pessoa.", path: ["members"] },
  )
  .refine(
    (v) =>
      new Set(v.members.map((m) => m.consultantId)).size === v.members.length,
    {
      message: "Um consultor não pode ocupar duas frentes.",
      path: ["members"],
    },
  );

export const coeSquadSetStatusSchema = z.object({
  id: entityId,
  status: z.enum(["DRAFT", "PROPOSED", "ARCHIVED"]),
});

export const coeSquadDeleteSchema = z.object({ id: entityId });

export type CoeSquadSaveInput = z.infer<typeof coeSquadSaveSchema>;
export type CoeSquadSetStatusInput = z.infer<typeof coeSquadSetStatusSchema>;
export type CoeSquadDeleteInput = z.infer<typeof coeSquadDeleteSchema>;
