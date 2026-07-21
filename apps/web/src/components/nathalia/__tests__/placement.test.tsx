/**
 * Nathal.IA placement and visibility.
 *
 * The widget must always be reachable and never clipped by the screen it sits
 * on. `NathaliaRoot` portals it to `document.body`, escaping ancestors that
 * would otherwise capture a fixed child and hide the launcher.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  NathaliaProvider,
  NathaliaRoot,
  NathaliaWidget,
} from "@jumpflow/character-nathalia";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/app/dashboard",
}));

afterEach(cleanup);

const user = { id: "u1", name: "Ana Paula", roles: ["CONSULTANT"] };

describe("NathaliaRoot", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollTo = vi.fn();
  });

  it("portals children to document.body on a click-through host layer", () => {
    render(
      <NathaliaRoot>
        <button data-testid="probe">hi</button>
      </NathaliaRoot>,
    );
    const host = document.querySelector<HTMLElement>("[data-nathalia-root]");
    expect(host).not.toBeNull();
    expect(host?.parentElement).toBe(document.body);
    expect(host?.style.pointerEvents).toBe("none");
    expect(host?.style.zIndex).toBe("9999");
    expect(host?.querySelector("[data-testid='probe']")).not.toBeNull();
  });

  it("renders the launcher even inside a transformed, overflow-hidden ancestor", () => {
    render(
      <div style={{ transform: "translateZ(0)", overflow: "hidden", width: 0, height: 0 }}>
        <NathaliaProvider user={user}>
          <NathaliaRoot>
            <NathaliaWidget />
          </NathaliaRoot>
        </NathaliaProvider>
      </div>,
    );
    const host = document.querySelector<HTMLElement>("[data-nathalia-root]");
    const launcher = document.querySelector<HTMLElement>("[data-nathalia-launcher]");
    expect(host).not.toBeNull();
    expect(launcher).not.toBeNull();
    expect(host?.contains(launcher!)).toBe(true);

    const layer = launcher?.closest("[class*='pointer-events-auto']");
    expect(layer).not.toBeNull();
    const layerEl = layer as HTMLElement;
    expect(layerEl.style.bottom).toBe("0.5rem");
    expect(layerEl.style.right).toBe("-2rem");
  });

  it("opens the chat panel directly when the free-standing launcher is clicked", () => {
    render(
      <NathaliaProvider user={user}>
        <NathaliaWidget />
      </NathaliaProvider>,
    );

    const launcher = document.querySelector<HTMLElement>("[data-nathalia-launcher]");
    expect(launcher).not.toBeNull();

    fireEvent.click(launcher!);

    expect(screen.getByPlaceholderText("Pergunte algo para a Nathal.IA...")).not.toBeNull();
    const layer = screen
      .getByPlaceholderText("Pergunte algo para a Nathal.IA...")
      .closest("[class*='pointer-events-auto']");
    const layerEl = layer as HTMLElement;
    expect(layerEl.style.bottom).toBe("1rem");
    expect(layerEl.style.right).toBe("1rem");
  });
});
