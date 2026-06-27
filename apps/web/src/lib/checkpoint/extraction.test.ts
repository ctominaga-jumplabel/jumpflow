import { describe, expect, it } from "vitest";
import {
  buildExtractionPrompt,
  checkpointSourceEntryId,
  mapExtraction,
  normalizeOpportunityKind,
  normalizeOpportunityPriority,
  normalizeSkillLevel,
  parseExtraction,
  resolveExtractionBody,
  type ExtractionOutput,
} from "./extraction";

/**
 * Pure-unit tests for the Checkpoint Intelligence AI pipeline (Melhoria #4, F4).
 * Cobre: parser defensivo (JSON válido/markdown/inválido/schema), normalização
 * de enums (level/kind/priority → enum, default seguro) e mapExtraction (skills
 * → SkillSuggestion com sourceEntryIds; opps/cases ancorados no checkpoint).
 */

const ctx = {
  checkpointId: "chk-1",
  consultantId: "cons-1",
  weekStart: new Date("2026-06-01T00:00:00Z"),
  weekEnd: new Date("2026-06-07T00:00:00Z"),
  relatedProjectId: "proj-1",
};

describe("parseExtraction", () => {
  it("parseia um JSON válido completo", () => {
    const raw = JSON.stringify({
      skills: [{ name: "React", category: "Frontend", level: "avançado", quote: "fez o front" }],
      opportunities: [{ kind: "upsell", title: "Mais squads", priority: "alta", quote: "querem expandir" }],
      cases: [{ title: "Entrega X", summary: "ok", quote: "entregou no prazo" }],
    });
    const r = parseExtraction(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.skills).toHaveLength(1);
      expect(r.data.opportunities[0].title).toBe("Mais squads");
      expect(r.data.cases[0].title).toBe("Entrega X");
    }
  });

  it("tolera cercas de markdown e prosa ao redor", () => {
    const raw =
      'Claro! Aqui está:\n```json\n{"skills":[{"name":"SQL"}],"opportunities":[],"cases":[]}\n```\nEspero que ajude.';
    const r = parseExtraction(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.skills[0].name).toBe("SQL");
  });

  it("aplica defaults para trilhas ausentes", () => {
    const r = parseExtraction('{"skills":[{"name":"Go"}]}');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.opportunities).toEqual([]);
      expect(r.data.cases).toEqual([]);
    }
  });

  it("falha em JSON inválido (sem lançar)", () => {
    const r = parseExtraction("isto não é json {");
    expect(r).toMatchObject({ ok: false, reason: "invalid_json" });
  });

  it("falha em resposta vazia/null", () => {
    expect(parseExtraction("")).toMatchObject({ ok: false, reason: "empty_response" });
    expect(parseExtraction(null)).toMatchObject({ ok: false, reason: "empty_response" });
    expect(parseExtraction(undefined)).toMatchObject({
      ok: false,
      reason: "empty_response",
    });
  });

  it("falha quando o schema não bate (skill sem name)", () => {
    const r = parseExtraction('{"skills":[{"category":"X"}],"opportunities":[],"cases":[]}');
    expect(r).toMatchObject({ ok: false, reason: "schema_mismatch" });
  });
});

describe("normalização para enums", () => {
  it("normalizeSkillLevel mapeia PT/EN e cai no default", () => {
    expect(normalizeSkillLevel("básico")).toBe("BASIC");
    expect(normalizeSkillLevel("avançado")).toBe("ADVANCED");
    expect(normalizeSkillLevel("specialist")).toBe("SPECIALIST");
    expect(normalizeSkillLevel("intermediário")).toBe("INTERMEDIATE");
    expect(normalizeSkillLevel(undefined)).toBe("INTERMEDIATE");
    expect(normalizeSkillLevel("xpto")).toBe("INTERMEDIATE");
  });

  it("normalizeOpportunityKind mapeia e cai no default", () => {
    expect(normalizeOpportunityKind("expansão")).toBe("EXPANSION");
    expect(normalizeOpportunityKind("upsell")).toBe("UPSELL");
    expect(normalizeOpportunityKind("risco")).toBe("RISK");
    expect(normalizeOpportunityKind("indicação")).toBe("REFERRAL");
    expect(normalizeOpportunityKind("renovação")).toBe("RENEWAL");
    expect(normalizeOpportunityKind(undefined)).toBe("EXPANSION");
    expect(normalizeOpportunityKind("???")).toBe("EXPANSION");
  });

  it("normalizeOpportunityPriority mapeia e cai no default", () => {
    expect(normalizeOpportunityPriority("baixa")).toBe("LOW");
    expect(normalizeOpportunityPriority("alta")).toBe("HIGH");
    expect(normalizeOpportunityPriority("crítica")).toBe("HIGH");
    expect(normalizeOpportunityPriority("media")).toBe("MEDIUM");
    expect(normalizeOpportunityPriority(undefined)).toBe("MEDIUM");
    expect(normalizeOpportunityPriority("zzz")).toBe("MEDIUM");
  });
});

describe("mapExtraction", () => {
  const output: ExtractionOutput = {
    skills: [
      { name: "Kubernetes", category: "Infra", level: "especialista", quote: "subiu o cluster" },
      { name: "Comunicação", quote: "alinhou bem" },
    ],
    opportunities: [
      {
        kind: "upsell",
        title: "Expandir squad",
        description: "Cliente quer mais devs",
        priority: "alta",
        clientHint: "ACME",
        quote: "precisamos de mais gente",
      },
    ],
    cases: [{ title: "Migração concluída", summary: "migrou tudo", outcome: "0 downtime", quote: "deu certo" }],
  };

  it("mapeia skills para SkillSuggestion com sourceEntryIds do checkpoint", () => {
    const m = mapExtraction(output, ctx);
    expect(m.skills).toHaveLength(2);
    const k = m.skills[0];
    expect(k.consultantId).toBe("cons-1");
    expect(k.weekStart).toEqual(ctx.weekStart);
    expect(k.weekEnd).toEqual(ctx.weekEnd);
    expect(k.suggestedName).toBe("Kubernetes");
    expect(k.suggestedCategory).toBe("Infra");
    expect(k.suggestedLevel).toBe("SPECIALIST");
    expect(k.evidenceSummary).toBe("subiu o cluster");
    expect(k.sourceEntryIds).toEqual(["checkpoint:chk-1"]);
    // skill sem level/category → default e null
    expect(m.skills[1].suggestedLevel).toBe("INTERMEDIATE");
    expect(m.skills[1].suggestedCategory).toBeNull();
  });

  it("mapeia oportunidades com enum normalizado e clientHint na descrição", () => {
    const m = mapExtraction(output, ctx);
    expect(m.opportunities).toHaveLength(1);
    const o = m.opportunities[0];
    expect(o.sourceCheckpointId).toBe("chk-1");
    expect(o.consultantId).toBe("cons-1");
    expect(o.relatedProjectId).toBe("proj-1");
    expect(o.kind).toBe("UPSELL");
    expect(o.priority).toBe("HIGH");
    expect(o.title).toBe("Expandir squad");
    expect(o.description).toContain("Cliente quer mais devs");
    // clientHint NÃO vira FK — fica no texto da descrição (handoff manual, sem CRM)
    expect(o.description).toContain("ACME");
    expect(o.sourceQuote).toBe("precisamos de mais gente");
  });

  it("mapeia cases ancorados no checkpoint", () => {
    const m = mapExtraction(output, ctx);
    expect(m.cases).toHaveLength(1);
    const c = m.cases[0];
    expect(c.sourceCheckpointId).toBe("chk-1");
    expect(c.title).toBe("Migração concluída");
    expect(c.summary).toBe("migrou tudo");
    expect(c.outcome).toBe("0 downtime");
    expect(c.sourceQuote).toBe("deu certo");
  });

  it("checkpointSourceEntryId formata a referência", () => {
    expect(checkpointSourceEntryId("abc")).toBe("checkpoint:abc");
  });
});

describe("prompt builder", () => {
  it("resolveExtractionBody prioriza transcrição e concatena notas", () => {
    expect(resolveExtractionBody({ transcription: "T", notes: "N" })).toContain("Transcrição");
    expect(resolveExtractionBody({ transcription: "T", notes: "N" })).toContain("Notas");
    expect(resolveExtractionBody({ transcription: "", notes: "" })).toBe("");
  });

  it("buildExtractionPrompt inclui o corpo e instrução de JSON", () => {
    const p = buildExtractionPrompt({ notes: "Conversa boa", type: "ONE_ON_ONE" });
    expect(p).toContain("Conversa boa");
    expect(p).toContain("JSON");
    expect(p).toContain("1-on-1");
  });
});
