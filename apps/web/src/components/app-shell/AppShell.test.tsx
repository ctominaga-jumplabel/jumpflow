import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/app-shell/AppShell";
import { primaryNavigation } from "@/lib/navigation";
import type { AppUser } from "@/lib/auth/types";

// The shell reads the current route via next/navigation; stub it for jsdom.
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/dashboard",
}));

const testUser: AppUser = {
  id: "u1",
  name: "Ana Martins",
  email: "ana.martins@jumplabel.com.br",
  roles: ["AREA_MANAGER"],
};

const noopLogout = async () => {};

function renderShell() {
  return render(
    <AppShell user={testUser} logoutAction={noopLogout}>
      conteudo
    </AppShell>,
  );
}

describe("AppShell", () => {
  it("renders every primary navigation item", () => {
    renderShell();
    for (const item of primaryNavigation) {
      expect(screen.getAllByText(item.label).length).toBeGreaterThan(0);
    }
  });

  it("renders the current user and role label in the topbar", () => {
    renderShell();
    expect(screen.getByText(testUser.name)).toBeInTheDocument();
    expect(screen.getByText("Gestor de Área")).toBeInTheDocument();
  });

  it("exposes a logout control", () => {
    renderShell();
    expect(screen.getByRole("button", { name: /sair/i })).toBeInTheDocument();
  });

  it("links to the dashboard", () => {
    renderShell();
    const dashboardLinks = screen.getAllByRole("link", { name: /dashboard/i });
    expect(
      dashboardLinks.some(
        (link) => link.getAttribute("href") === "/app/dashboard",
      ),
    ).toBe(true);
  });

  it("renders its children in the main region", () => {
    render(
      <AppShell user={testUser} logoutAction={noopLogout}>
        conteudo de teste
      </AppShell>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("conteudo de teste");
  });

  it("opens the mobile drawer and makes the main column inert", () => {
    renderShell();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /abrir navegação/i }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("main").closest("[inert]")).not.toBeNull();
  });

  it("closes the mobile drawer on Escape", async () => {
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: /abrir navegação/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(
      () => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      { timeout: 2000 },
    );
  });
});
