/**
 * Fase 8.1 — Nathal.IA conversational UX polish.
 *
 * Covers the pure additions: viewport-safe panel layout (Etapas 1–2) and the
 * contextual, named welcome experience (Etapa 4).
 */
import { describe, it, expect } from "vitest";
import {
  NATHALIA_PANEL_DEFAULTS,
  nathaliaFirstName,
  nathaliaWelcome,
  resolveNathaliaPanelLayout,
} from "@jumpflow/character-nathalia";

describe("resolveNathaliaPanelLayout", () => {
  it("uses a premium corner panel on a roomy desktop", () => {
    const l = resolveNathaliaPanelLayout({ viewportWidth: 1440, viewportHeight: 900 });
    expect(l.placement).toBe("corner");
    expect(l.width).toBe(NATHALIA_PANEL_DEFAULTS.preferredWidth);
    expect(l.height).toBe(NATHALIA_PANEL_DEFAULTS.preferredHeight);
    expect(l.constrainedWidth).toBe(false);
    expect(l.constrainedHeight).toBe(false);
  });

  it("keeps the preferred width inside the requested 520–600 band", () => {
    expect(NATHALIA_PANEL_DEFAULTS.preferredWidth).toBeGreaterThanOrEqual(520);
    expect(NATHALIA_PANEL_DEFAULTS.preferredWidth).toBeLessThanOrEqual(600);
    expect(NATHALIA_PANEL_DEFAULTS.preferredHeight).toBeGreaterThanOrEqual(420);
    expect(NATHALIA_PANEL_DEFAULTS.preferredHeight).toBeLessThanOrEqual(520);
  });

  it("falls back to a near-full sheet on a narrow phone", () => {
    const l = resolveNathaliaPanelLayout({ viewportWidth: 360, viewportHeight: 640 });
    expect(l.placement).toBe("sheet");
    expect(l.width).toBeLessThan(360);
    expect(l.height).toBeLessThan(640);
  });

  it("falls back to a sheet on a short landscape window", () => {
    const l = resolveNathaliaPanelLayout({ viewportWidth: 820, viewportHeight: 420 });
    expect(l.placement).toBe("sheet");
  });

  it("never produces a panel that overflows the viewport", () => {
    const viewports = [
      [320, 480],
      [360, 640],
      [768, 1024],
      [820, 420],
      [1024, 768],
      [1440, 900],
      [1920, 1080],
    ] as const;
    for (const [w, h] of viewports) {
      const l = resolveNathaliaPanelLayout({ viewportWidth: w, viewportHeight: h });
      expect(l.width).toBeGreaterThan(0);
      expect(l.height).toBeGreaterThan(0);
      // Width + both side offsets must fit; same for height.
      expect(l.width + l.offset * 2).toBeLessThanOrEqual(w);
      expect(l.height + l.offset * 2).toBeLessThanOrEqual(h);
    }
  });
});

describe("nathaliaFirstName", () => {
  it("returns the first token of a full name", () => {
    expect(nathaliaFirstName({ id: "1", name: "Ana Paula Souza", roles: [] })).toBe("Ana");
  });

  it("returns null when the name is missing or blank", () => {
    expect(nathaliaFirstName({ id: "1", name: "   ", roles: [] })).toBeNull();
    expect(nathaliaFirstName(null)).toBeNull();
    expect(nathaliaFirstName({ id: "1", roles: [] })).toBeNull();
  });
});

describe("nathaliaWelcome", () => {
  const ana = { id: "1", name: "Ana", roles: ["CONSULTANT"] };

  it("greets the user by name on the home/general screen", () => {
    const w = nathaliaWelcome("general", ana);
    expect(w.greeting).toBe("Olá, Ana!");
    expect(w.full.startsWith("Olá, Ana!")).toBe(true);
    expect(w.body.toLowerCase()).toContain("navegar");
  });

  it("acknowledges the current screen on hours", () => {
    const w = nathaliaWelcome("hours", ana);
    expect(w.body.toLowerCase()).toContain("horas");
  });

  it("stays warm and name-less when the user is unknown", () => {
    const w = nathaliaWelcome("projects", null);
    expect(w.greeting).toBe("Olá!");
    expect(w.body.toLowerCase()).toContain("projeto");
  });
});
