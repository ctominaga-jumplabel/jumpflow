import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/app-shell/AppShell";
import { primaryNavigation } from "@/lib/navigation";
import { mockUser } from "@/lib/mock-data/user";

// The shell reads the current route via next/navigation; stub it for jsdom.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/dashboard",
}));

describe("AppShell", () => {
  it("renders every primary navigation item", () => {
    render(<AppShell>conteudo</AppShell>);
    for (const item of primaryNavigation) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
    }
  });

  it("renders the mocked user in the topbar", () => {
    render(<AppShell>conteudo</AppShell>);
    expect(screen.getByText(mockUser.name)).toBeInTheDocument();
    expect(screen.getByText(mockUser.role)).toBeInTheDocument();
  });

  it("links to the dashboard", () => {
    render(<AppShell>conteudo</AppShell>);
    const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
    expect(
      dashboardLinks.some(
        (link) => link.getAttribute("href") === "/app/dashboard",
      ),
    ).toBe(true);
  });

  it("renders its children in the main region", () => {
    render(<AppShell>conteudo de teste</AppShell>);
    expect(screen.getByRole("main")).toHaveTextContent("conteudo de teste");
  });

  it("opens the mobile drawer and makes the main column inert", () => {
    render(<AppShell>conteudo</AppShell>);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /abrir navegação/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("main").closest("[inert]")).not.toBeNull();
  });

  it("closes the mobile drawer on Escape", async () => {
    render(<AppShell>conteudo</AppShell>);
    fireEvent.click(screen.getByRole("button", { name: /abrir navegação/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(
      () => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      { timeout: 2000 },
    );
  });
});
