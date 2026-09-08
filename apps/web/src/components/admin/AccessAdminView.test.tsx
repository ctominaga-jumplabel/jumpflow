import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccessAdminView } from "./AccessAdminView";
import type { AccessUserView } from "@/lib/db/invitations";

vi.mock("@/app/app/admin/acessos/actions", () => ({
  changeUserRoles: vi.fn(async () => ({ ok: true, data: { id: "u1" } })),
  changeUserStatus: vi.fn(async () => ({ ok: true, data: { id: "u1" } })),
  inviteUser: vi.fn(async () => ({ ok: true, data: { email: "a@b.com" } })),
  regenerateInvite: vi.fn(async () => ({
    ok: true,
    data: { email: "a@b.com" },
  })),
  revokeInvite: vi.fn(async () => ({ ok: true, data: { id: "i1" } })),
}));

function user(over: Partial<AccessUserView> = {}): AccessUserView {
  return {
    id: "u1",
    name: "Ana Souza",
    email: "ana.souza@jumplabel.com.br",
    status: "ACTIVE",
    roles: ["CONSULTANT"],
    lastLoginAt: null,
    ...over,
  };
}

const USERS: AccessUserView[] = [
  user(),
  user({ id: "u2", name: "José Antônio", email: "jose@jumplabel.com.br" }),
  user({ id: "u3", name: "Bruno Lima", email: "bruno@jumplabel.com.br" }),
];

/** A tabela de usuários; a busca vive no cabeçalho do painel, fora dela. */
function rowNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1) // descarta o cabeçalho
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
}

function search(term: string) {
  fireEvent.change(screen.getByLabelText("Buscar usuário por nome ou e-mail"), {
    target: { value: term },
  });
}

describe("AccessAdminView — filtro de usuários", () => {
  it("lista todos os usuários sem termo de busca", () => {
    render(<AccessAdminView users={USERS} invitations={[]} />);
    expect(rowNames()).toHaveLength(3);
    expect(screen.getByText("3 usuários")).toBeInTheDocument();
  });

  it("filtra pelo nome", () => {
    render(<AccessAdminView users={USERS} invitations={[]} />);
    search("bruno");
    const names = rowNames();
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("Bruno Lima");
  });

  it("filtra pelo e-mail — é como o admin costuma procurar", () => {
    render(<AccessAdminView users={USERS} invitations={[]} />);
    search("ana.souza@");
    expect(rowNames()).toHaveLength(1);
  });

  it("ignora acentos: 'jose' encontra 'José Antônio'", () => {
    render(<AccessAdminView users={USERS} invitations={[]} />);
    search("jose antonio");
    const names = rowNames();
    expect(names).toHaveLength(1);
    expect(names[0]).toContain("José Antônio");
  });

  it("ignora caixa e espaços em volta", () => {
    render(<AccessAdminView users={USERS} invitations={[]} />);
    search("  ANA  ");
    expect(rowNames()).toHaveLength(1);
  });

  it("mostra o recorte no contador", () => {
    render(<AccessAdminView users={USERS} invitations={[]} />);
    search("a");
    expect(screen.getByText(/de 3$/)).toBeInTheDocument();
  });

  it("sem correspondência, o vazio NÃO convida a cadastrar ninguém", () => {
    // "Nenhum usuário ainda" sugeriria convidar alguém; aqui existem usuários,
    // só nenhum casa com o termo — a saída é corrigir a busca.
    render(<AccessAdminView users={USERS} invitations={[]} />);
    search("zzzz");
    expect(
      screen.getByText("Nenhum usuário corresponde à busca"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Nenhum usuário ainda")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("volta a listar tudo ao limpar a busca", () => {
    render(<AccessAdminView users={USERS} invitations={[]} />);
    search("zzzz");
    search("");
    expect(rowNames()).toHaveLength(3);
  });

  it("sem nenhum usuário, não renderiza a busca", () => {
    render(<AccessAdminView users={[]} invitations={[]} />);
    expect(screen.getByText("Nenhum usuário ainda")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Buscar usuário por nome ou e-mail"),
    ).not.toBeInTheDocument();
  });
});
