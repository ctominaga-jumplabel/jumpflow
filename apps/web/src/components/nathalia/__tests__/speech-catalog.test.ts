import { describe, expect, it } from "vitest";
import {
  nathaliaTours,
  speechPointForTourStep,
  speechPointsForContext,
  textToVoice,
  audioForSpeechPoint,
  nathaliaVoiceReference,
} from "@jumpflow/character-nathalia";

describe("Nathal.IA speech catalog", () => {
  it("drives the hours tour from the shared speech points", () => {
    const points = speechPointsForContext("hours");

    expect(points).toHaveLength(nathaliaTours.hours.steps.length);
    expect(points.map((point) => point.targetId)).toEqual(
      nathaliaTours.hours.steps.map((step) => step.targetId),
    );
    expect(points.map((point) => point.state)).toEqual(
      nathaliaTours.hours.steps.map((step) => step.state),
    );
  });

  it("keeps a natural voice script for each visible tour line", () => {
    const first = speechPointForTourStep("hours", 0);
    expect(first?.title).toBe("1 - Período");
    expect(first?.message).toBe("Escolha aqui a semana que deseja revisar.");
    expect(first ? textToVoice(first) : "").toContain("semana");
    expect(first ? audioForSpeechPoint(first) : "").toBe(
      "/nathalia/audio/nath-custom-review/01-hours-period.mp3?v=nath-20260706-ui2",
    );
  });

  it("exposes Nath's reference voice sample as public audio assets", () => {
    expect(nathaliaVoiceReference.sourceFile).toBe("audios/PTT-20250610-WA0002.wav");
    expect(nathaliaVoiceReference.durationMs).toBeGreaterThan(37000);
    expect(nathaliaVoiceReference.assets.map((asset) => asset.format)).toEqual([
      "mp3",
      "opus",
      "wav",
    ]);
    expect(nathaliaVoiceReference.assets[0]?.src).toBe(
      "/nathalia/audio/nath-reference/PTT-20250610-WA0002.mp3",
    );
  });
});
