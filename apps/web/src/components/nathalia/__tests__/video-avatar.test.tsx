import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  Nathalia2DApp,
  NathaliaVideoAvatar,
  videoClipForNathalia,
} from "@jumpflow/character-nathalia";

describe("Nathalia video avatar", () => {
  it("maps contextual screens to their Flow clips", () => {
    expect(videoClipForNathalia("explaining", "hours").key).toBe("hours_clipboard");
    expect(videoClipForNathalia("explaining", "projects").key).toBe("projects_kanban");
    expect(videoClipForNathalia("explaining", "approvals").key).toBe("approvals_badge");
    expect(videoClipForNathalia("explaining", "reports").key).toBe("reports_chart");
  });

  it("lets transient emotional states override contextual clips", () => {
    expect(videoClipForNathalia("thinking", "hours").key).toBe("thinking");
    expect(videoClipForNathalia("success", "projects").key).toBe("success_thumbs_up");
    expect(videoClipForNathalia("warning", "reports").key).toBe("warning_attention");
  });

  it("renders only the WebM alpha source in the runtime avatar", () => {
    const { container } = render(
      <NathaliaVideoAvatar state="explaining" context="hours" size={120} />,
    );
    const root = container.querySelector('[data-nathalia-variant="video-2d"]');
    expect(root?.getAttribute("data-nathalia-video")).toBe("hours_clipboard");

    const sources = Array.from(container.querySelectorAll("source"));
    expect(sources.map((source) => source.getAttribute("src"))).toEqual([
      "/nathalia/videos/flow/hours_clipboard.webm",
    ]);
  });

  it("provides an extensible 2D app stage", () => {
    const { container } = render(
      <Nathalia2DApp state="explaining" context="projects" size={180}>
        <span data-testid="overlay" />
      </Nathalia2DApp>,
    );

    const stage = container.querySelector("[data-nathalia-2d-app]");
    expect(stage?.getAttribute("data-nathalia-context")).toBe("projects");
    expect(container.querySelector('[data-nathalia-video="projects_kanban"]')).not.toBeNull();
    expect(container.querySelector("[data-nathalia-2d-overlay]")).not.toBeNull();
  });
});
