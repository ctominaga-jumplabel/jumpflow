/**
 * Fase 4-5 — Avatar 2D em camadas (Nathalia2DAvatar) + integração por flag.
 *
 * Verifies the layered avatar renders its composed layers, reflects the active
 * animation/state via data-attributes, and that the public `NathaliaAvatar`
 * selects it only when `NEXT_PUBLIC_NATHALIA_2D_LAYERED=true` (default off keeps
 * the existing expressive bust — no regression).
 */
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Nathalia2DAvatar, NathaliaAvatar } from "@jumpflow/character-nathalia";

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_NATHALIA_2D_LAYERED;
  delete process.env.NEXT_PUBLIC_NATHALIA_VIDEO_2D;
  delete process.env.NEXT_PUBLIC_NATHALIA_VIDEO_BASE_URL;
});

describe("Nathalia2DAvatar", () => {
  it("renders the layered variant with a face layer image", () => {
    const { container } = render(<Nathalia2DAvatar animation="thinking" size={120} />);
    const root = container.querySelector('[data-nathalia-variant="2d-layered"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-nathalia-animation")).toBe("thinking");
    // At least the face layer is composited.
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("maps an emotional state to its animation and marks speaking while talking", () => {
    const { container } = render(
      <Nathalia2DAvatar state="explaining" speaking size={120} />,
    );
    const root = container.querySelector('[data-nathalia-variant="2d-layered"]');
    expect(root?.getAttribute("data-nathalia-animation")).toBe("talking");
    expect(root?.getAttribute("data-nathalia-speaking")).toBe("1");
    expect(root?.getAttribute("data-nathalia-mouth")).toBe("rest");
  });

  it("uses separated mouth overlays when an audio viseme is provided", () => {
    const { container } = render(
      <Nathalia2DAvatar animation="talking" speaking viseme="a" size={120} />,
    );
    const root = container.querySelector('[data-nathalia-variant="2d-layered"]');
    expect(root?.getAttribute("data-nathalia-mouth")).toBe("a");
    expect(container.querySelector('img[src="/nathalia/layers/face/mouths/mouth-a.webp"]')).not.toBeNull();
  });

  it("shows the context object badge on a screen that has one", () => {
    const { container } = render(
      <Nathalia2DAvatar animation="idle" context="hours" size={160} />,
    );
    const root = container.querySelector('[data-nathalia-variant="2d-layered"]');
    expect(root?.getAttribute("data-nathalia-object")).toBe("horas");
  });
});

describe("NathaliaAvatar flag selection", () => {
  it("uses the expressive 2D bust by default (video is opt-in)", () => {
    // Video clips are served from external storage and only turn on when a base
    // URL is configured, so with no env the safe illustrated avatar renders.
    const { container } = render(<NathaliaAvatar state="idle" size={80} />);
    expect(container.querySelector('[data-nathalia-variant="video-2d"]')).toBeNull();
    expect(container.querySelector('[data-nathalia-variant="2d-expr"]')).not.toBeNull();
  });

  it("uses the video avatar when a video base URL is configured", () => {
    process.env.NEXT_PUBLIC_NATHALIA_VIDEO_BASE_URL = "https://cdn.example.com/nathalia/videos/flow";
    const { container } = render(<NathaliaAvatar state="idle" size={80} />);
    const root = container.querySelector('[data-nathalia-variant="video-2d"]');
    expect(root).not.toBeNull();
    expect(root?.getAttribute("data-nathalia-video")).toBe("idle_loop");
  });

  it("force-disables video with NATHALIA_VIDEO_2D=false even if a base URL is set", () => {
    process.env.NEXT_PUBLIC_NATHALIA_VIDEO_BASE_URL = "https://cdn.example.com/nathalia/videos/flow";
    process.env.NEXT_PUBLIC_NATHALIA_VIDEO_2D = "false";
    const { container } = render(<NathaliaAvatar state="idle" size={80} />);
    expect(container.querySelector('[data-nathalia-variant="video-2d"]')).toBeNull();
    expect(container.querySelector('[data-nathalia-variant="2d-expr"]')).not.toBeNull();
  });

  it("uses the layered avatar when the layered flag is on (and video off)", () => {
    process.env.NEXT_PUBLIC_NATHALIA_2D_LAYERED = "true";
    const { container } = render(<NathaliaAvatar state="idle" size={80} />);
    expect(container.querySelector('[data-nathalia-variant="2d-layered"]')).not.toBeNull();
  });

  it("keeps the expressive bust when video and layered renderers are disabled", () => {
    const { container } = render(<NathaliaAvatar state="idle" size={80} />);
    expect(container.querySelector('[data-nathalia-variant="2d-layered"]')).toBeNull();
    expect(container.querySelector('[data-nathalia-variant="2d-expr"]')).not.toBeNull();
  });
});
