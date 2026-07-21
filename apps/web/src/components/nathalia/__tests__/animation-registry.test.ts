/**
 * Fase 4 — Sistema de animação 2D em camadas (registry + catálogo).
 *
 * Covers the pure, React-free contract the layered avatar (`Nathalia2DAvatar`)
 * depends on: the 10 required animation states exist, every emotional state maps
 * to one, motion keyframes scale with size, and the catalog reports which layers
 * have art (face/eyes/mouths/visemes/objects present today; body/poses absent).
 */
import { describe, it, expect } from "vitest";
import {
  NATHALIA_ANIMATION_STATES,
  layeredAnimationFor,
  getAnimationDef,
  motionKeyframes,
  hasLayer,
  spriteFor,
  spritesByCategory,
  nathaliaSpriteCounts,
} from "@jumpflow/character-nathalia";

describe("nathaliaAnimationRegistry", () => {
  it("declares the 10 required animation states", () => {
    expect(NATHALIA_ANIMATION_STATES).toEqual([
      "idle", "idle_blink", "listening", "talking", "thinking",
      "success", "error", "alert", "celebrate", "wave",
    ]);
  });

  it("maps every emotional state to a known animation state", () => {
    const states = [
      "idle", "welcome", "listening", "thinking", "searching", "explaining",
      "pointing", "happy", "warning", "error", "success", "celebrate",
    ] as const;
    for (const s of states) {
      const anim = layeredAnimationFor(s);
      expect(NATHALIA_ANIMATION_STATES).toContain(anim);
      expect(getAnimationDef(anim).key).toBe(anim);
    }
  });

  it("talking speaks; idle does not", () => {
    expect(getAnimationDef("talking").speaking).toBe(true);
    expect(getAnimationDef("idle").speaking).toBe(false);
  });

  it("scales motion amplitude with size and stays still for the 'still' profile", () => {
    const small = motionKeyframes("calm", 56);
    const big = motionKeyframes("calm", 200);
    const smallAmp = Math.max(...small.y.map(Math.abs));
    const bigAmp = Math.max(...big.y.map(Math.abs));
    expect(bigAmp).toBeGreaterThan(smallAmp);
    expect(motionKeyframes("still", 200).y.every((v) => v === 0)).toBe(true);
  });
});

describe("nathaliaSpriteCatalog", () => {
  it("reports face/eye/mouth/viseme/object layers present and body/poses absent", () => {
    expect(hasLayer("face")).toBe(true);
    expect(hasLayer("faceBase")).toBe(true);
    expect(hasLayer("eyes")).toBe(true);
    expect(hasLayer("mouths")).toBe(true);
    expect(hasLayer("visemes")).toBe(true);
    expect(hasLayer("objects")).toBe(true);
    expect(hasLayer("body")).toBe(false);
    expect(hasLayer("poses")).toBe(false);
  });

  it("resolves a known expression sprite with a served URL", () => {
    const sprite = spriteFor("expression", "pensativa");
    expect(sprite).not.toBeNull();
    expect(sprite?.webUrl).toBe("/nathalia/expressions/pensativa.webp");
    expect(sprite?.hasAlpha).toBe(true);
  });

  it("has the full set of served face/viseme/object sprites", () => {
    expect(spritesByCategory("expression").length).toBe(17);
    expect(spritesByCategory("viseme").length).toBe(12);
    expect(spritesByCategory("eye").length).toBe(2);
    expect(spritesByCategory("mouth").length).toBe(12);
    expect(spritesByCategory("object").length).toBe(4);
    expect(nathaliaSpriteCounts.expression).toBe(17);
    expect(nathaliaSpriteCounts.mouth).toBe(12);
  });
});
