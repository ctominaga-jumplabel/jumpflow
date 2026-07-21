/**
 * Fase 7.1 — Nathal.IA avatar framing (enquadramento do widget flutuante).
 *
 * Covers the pure, three-free framing math: per-mode presets, override
 * resolution (zoom/cameraY/modelScale), clamping, and the 2D SVG transform that
 * keeps the CSS fallback visually consistent with the 3D crop.
 */
import { describe, it, expect } from "vitest";
import {
  nathalia2DFraming,
  nathalia2DTransform,
  nathaliaFramingPresets,
  resolveNathaliaFraming,
} from "@jumpflow/character-nathalia";

describe("resolveNathaliaFraming", () => {
  it("defaults to the tight bubble preset", () => {
    expect(resolveNathaliaFraming()).toEqual(nathaliaFramingPresets.bubble);
    expect(resolveNathaliaFraming("bubble")).toEqual(nathaliaFramingPresets.bubble);
  });

  it("frames the bubble closer (looking higher) than the panel", () => {
    const bubble = resolveNathaliaFraming("bubble");
    const panel = resolveNathaliaFraming("panel");
    // Bust: camera pulled in and aimed at the face/shoulders.
    expect(bubble.distance).toBeLessThan(panel.distance);
    expect(bubble.targetY).toBeGreaterThan(panel.targetY);
  });

  it("keeps the bubble an aggressive face-first close-up (Fase 8.2)", () => {
    const bubble = resolveNathaliaFraming("bubble");
    // A tight distance + a high look-at make the face the protagonist.
    expect(bubble.distance).toBeLessThan(0.8);
    expect(bubble.targetY).toBeGreaterThanOrEqual(0.35);
  });

  it("zoom > 1 pulls the camera in; zoom < 1 pushes it out", () => {
    const base = nathaliaFramingPresets.bubble.distance;
    expect(resolveNathaliaFraming("bubble", { zoom: 2 }).distance).toBeCloseTo(base / 2);
    expect(resolveNathaliaFraming("bubble", { zoom: 0.5 }).distance).toBeCloseTo(base / 0.5);
  });

  it("cameraY offsets the look-at height", () => {
    const { targetY } = resolveNathaliaFraming("panel", { cameraY: 0.1 });
    expect(targetY).toBeCloseTo(nathaliaFramingPresets.panel.targetY + 0.1);
  });

  it("modelScale multiplies the preset scale", () => {
    expect(resolveNathaliaFraming("bubble", { modelScale: 1.5 }).modelScale).toBeCloseTo(1.5);
  });

  it("clamps absurd zoom/scale into a sane range", () => {
    const tiny = resolveNathaliaFraming("bubble", { zoom: 0.001, modelScale: 100 });
    expect(tiny.distance).toBeLessThanOrEqual(12);
    expect(tiny.modelScale).toBeLessThanOrEqual(4);
  });

  it("falls back to the bubble preset for an unknown mode", () => {
    // @ts-expect-error — exercising the defensive default.
    expect(resolveNathaliaFraming("nope")).toEqual(nathaliaFramingPresets.bubble);
  });
});

describe("nathalia2DFraming", () => {
  it("zooms the bubble in more than the panel; lab stays 1:1", () => {
    expect(nathalia2DFraming("bubble").scale).toBeGreaterThan(
      nathalia2DFraming("panel").scale,
    );
    expect(nathalia2DFraming("lab").scale).toBe(1);
  });

  it("crops the 2D bubble hard enough to make the face dominant (Fase 8.2)", () => {
    expect(nathalia2DFraming("bubble").scale).toBeGreaterThanOrEqual(1.7);
  });

  it("emits a pivoted scale transform for zoomed modes and nothing at 1:1", () => {
    expect(nathalia2DTransform("bubble")).toContain("scale(");
    expect(nathalia2DTransform("bubble")).toContain("translate(");
    expect(nathalia2DTransform("lab")).toBe("");
  });
});
