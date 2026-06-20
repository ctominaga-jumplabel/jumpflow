import type { AutoSourceOption, KeyResultMetric, ObjectiveScope } from "./types";

/**
 * Catálogo PURO das fontes operacionais de auto-update de Key Result (EP 7.2).
 *
 * Um KR pode declarar um `autoSource` (chave). Quando a chave é reconhecida
 * aqui, o currentValue do KR pode ser recalculado a partir de dado operacional
 * real do período/escopo do objetivo (ex.: horas apontadas no TimeEntry). Para
 * `autoSource` desconhecido (ou null), o KR permanece MANUAL.
 *
 * Este módulo é puro (sem I/O): só descreve as fontes, valida a aplicabilidade
 * por escopo e expõe o contrato. A resolução real (a query) mora em
 * lib/db/okrs.ts (resolveAutoSourceValue), que consome ESTE catálogo. Mantemos a
 * separação para testar o catálogo/elegibilidade sem banco e deixar extensível:
 * adicionar uma fonte = uma entrada aqui + um case na query.
 *
 * NÃO inventamos dados: começamos com 2 fontes reais já disponíveis (horas
 * aprovadas no período, total e faturáveis), aplicáveis a CONSULTANT e PROJECT.
 * Fontes financeiras (margem) ficam documentadas como extensão futura e exigem
 * papel financeiro — não habilitadas aqui para não expor margem sem proteção.
 */

export type AutoSourceKey = "hours_total" | "hours_billable";

interface AutoSourceDef extends AutoSourceOption {
  key: AutoSourceKey;
  /** Escopos de objetivo onde a fonte faz sentido (consultor/projeto). */
  applicableScopes: ObjectiveScope[];
  /** Apenas horas faturáveis quando true; senão todas. */
  billableOnly: boolean;
}

/**
 * Fontes reconhecidas. Extensível: novas fontes (ex.: 'margin', 'revenue')
 * entram como nova entrada + case correspondente na query de resolução.
 */
const AUTO_SOURCES: Record<AutoSourceKey, AutoSourceDef> = {
  hours_total: {
    key: "hours_total",
    label: "Horas apontadas (aprovadas) no período",
    description:
      "Soma das horas aprovadas no período do objetivo, do consultor ou do projeto.",
    metricType: "NUMBER",
    unit: "h",
    applicableScopes: ["CONSULTANT", "PROJECT"],
    billableOnly: false,
  },
  hours_billable: {
    key: "hours_billable",
    label: "Horas faturáveis (aprovadas) no período",
    description:
      "Soma das horas faturáveis aprovadas no período, do consultor ou do projeto.",
    metricType: "NUMBER",
    unit: "h",
    applicableScopes: ["CONSULTANT", "PROJECT"],
    billableOnly: true,
  },
};

/** Type guard: a chave é uma fonte operacional reconhecida? */
export function isKnownAutoSource(
  key: string | null | undefined,
): key is AutoSourceKey {
  return typeof key === "string" && key in AUTO_SOURCES;
}

/** Definição da fonte, ou null se desconhecida. */
export function getAutoSourceDef(
  key: string | null | undefined,
): AutoSourceDef | null {
  return isKnownAutoSource(key) ? AUTO_SOURCES[key] : null;
}

/**
 * A fonte é aplicável ao escopo do objetivo? Uma fonte de horas não faz sentido
 * em escopo AREA/COMPANY (sem âncora operacional única). Pura.
 */
export function isAutoSourceApplicable(
  key: string | null | undefined,
  scope: ObjectiveScope,
): boolean {
  const def = getAutoSourceDef(key);
  if (!def) return false;
  return def.applicableScopes.includes(scope);
}

/** Opções de fonte para um dado escopo, para popular o seletor da UI. */
export function autoSourceOptionsForScope(
  scope: ObjectiveScope,
): AutoSourceOption[] {
  return Object.values(AUTO_SOURCES)
    .filter((s) => s.applicableScopes.includes(scope))
    .map((s) => ({
      key: s.key,
      label: s.label,
      description: s.description,
      metricType: s.metricType,
      unit: s.unit,
    }));
}

/** metricType esperado por uma fonte (todas as atuais são NUMBER de horas). */
export function autoSourceMetricType(
  key: string | null | undefined,
): KeyResultMetric | null {
  return getAutoSourceDef(key)?.metricType ?? null;
}

/** Apenas horas faturáveis? Usado pela query de resolução. */
export function autoSourceBillableOnly(key: AutoSourceKey): boolean {
  return AUTO_SOURCES[key].billableOnly;
}
