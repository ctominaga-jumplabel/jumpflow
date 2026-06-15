export interface SkillCatalogItem {
  id: string;
  name: string;
  category: string | null;
}

export type SuggestedSkillLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "SPECIALIST";

export interface ActivityEvidence {
  id: string;
  description: string | null;
  activityType: string;
  date: Date;
}

export interface GeneratedSkillSuggestion {
  skillId: string | null;
  suggestedName: string;
  suggestedCategory: string | null;
  suggestedLevel: SuggestedSkillLevel;
  evidenceSummary: string;
  sourceEntryIds: string[];
}

const KEYWORD_SUGGESTIONS: Array<{
  name: string;
  category: string;
  keywords: string[];
}> = [
  { name: "React", category: "Frontend", keywords: ["react", "jsx", "component"] },
  { name: "TypeScript", category: "Frontend", keywords: ["typescript", "tipagem", "types"] },
  { name: "Node.js", category: "Backend", keywords: ["node", "api", "backend", "endpoint"] },
  { name: "SQL", category: "Dados", keywords: ["sql", "query", "postgres", "banco"] },
  { name: "AWS", category: "Cloud", keywords: ["aws", "lambda", "s3", "cloudwatch"] },
  { name: "Azure", category: "Cloud", keywords: ["azure", "entra", "devops"] },
  { name: "Terraform", category: "Cloud", keywords: ["terraform", "iac"] },
  { name: "UX Research", category: "Produto", keywords: ["entrevista", "pesquisa", "usuario"] },
  { name: "Discovery", category: "Produto", keywords: ["discovery", "requisito", "workshop"] },
  { name: "QA", category: "Qualidade", keywords: ["teste", "qa", "validacao", "bug"] },
];

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function excerpt(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 180 ? `${trimmed.slice(0, 177)}...` : trimmed;
}

function levelFor(count: number, text: string): SuggestedSkillLevel {
  const normalized = normalize(text);
  if (count >= 3 || /\b(arquitet|lider|lead|mentoria|estrateg)/.test(normalized)) {
    return "ADVANCED";
  }
  if (count <= 1) return "INTERMEDIATE";
  return "INTERMEDIATE";
}

export function generateSkillSuggestionsFromActivities(
  activities: ActivityEvidence[],
  catalog: SkillCatalogItem[],
): GeneratedSkillSuggestion[] {
  const textEntries = activities
    .map((activity) => ({
      ...activity,
      text: activity.description?.trim() || activity.activityType,
      normalized: normalize(activity.description ?? activity.activityType),
    }))
    .filter((activity) => activity.text.length > 0);
  if (textEntries.length === 0) return [];

  const catalogByName = new Map(catalog.map((skill) => [normalize(skill.name), skill]));
  const candidates = [
    ...catalog.map((skill) => ({
      name: skill.name,
      category: skill.category ?? null,
      keywords: [skill.name],
    })),
    ...KEYWORD_SUGGESTIONS,
  ];

  const byName = new Map<string, GeneratedSkillSuggestion>();
  for (const candidate of candidates) {
    const matches = textEntries.filter((entry) =>
      candidate.keywords.some((keyword) => entry.normalized.includes(normalize(keyword))),
    );
    if (matches.length === 0) continue;

    const key = normalize(candidate.name);
    if (byName.has(key)) continue;
    const catalogSkill = catalogByName.get(key);
    const joinedText = matches.map((match) => match.text).join(" ");
    byName.set(key, {
      skillId: catalogSkill?.id ?? null,
      suggestedName: catalogSkill?.name ?? candidate.name,
      suggestedCategory: catalogSkill?.category ?? candidate.category,
      suggestedLevel: levelFor(matches.length, joinedText),
      evidenceSummary: excerpt(matches[0].text),
      sourceEntryIds: matches.map((match) => match.id),
    });
  }

  return [...byName.values()].slice(0, 8);
}
