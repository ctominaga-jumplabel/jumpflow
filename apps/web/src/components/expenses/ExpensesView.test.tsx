import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Expense } from "@/lib/expenses/types";
import { ExpensesView } from "./ExpensesView";

// Server actions never run in jsdom: mock the module so the db-mode wiring
// can be asserted without Prisma/auth imports.
vi.mock("@/app/app/despesas/actions", () => ({
  createExpenseBatch: vi.fn(async () => ({
    ok: true,
    data: { groupId: "grp-1", ids: ["exp-new"] },
  })),
  updateExpense: vi.fn(async () => ({ ok: true, data: { id: "exp-new" } })),
  deleteExpense: vi.fn(async () => ({ ok: true, data: { id: "exp-new" } })),
  submitExpense: vi.fn(async () => ({ ok: true, data: { id: "exp-new" } })),
  attachReceipt: vi.fn(async () => ({ ok: false, error: "NO_STORAGE", message: "x" })),
  replaceReceipt: vi.fn(async () => ({ ok: false, error: "NO_STORAGE", message: "x" })),
  getReceiptUrl: vi.fn(async () => ({ ok: false, error: "NO_STORAGE", message: "x" })),
}));

import { getReceiptUrl, submitExpense } from "@/app/app/despesas/actions";

function renderDemo() {
  return render(
    <ExpensesView mode="demo" consultantName="Ana Tester" today="2026-06-10" />,
  );
}

const dbExpense: Expense = {
  id: "exp-db-1",
  projectId: "proj-1",
  projectName: "Portal",
  clientName: "Cliente X",
  consultantName: "Ana Tester",
  date: "2026-06-08",
  amount: 120.5,
  description: "Despesa real de banco",
  status: "DRAFT",
  attachment: {
    fileName: "nota.pdf",
    contentType: "application/pdf",
    size: 1200,
  },
  source: "db",
};

describe("ExpensesView (demo mode)", () => {
  it("renders the banner, summary, filters and list", () => {
    renderDemo();
    expect(screen.getByText(/Modo demonstração/)).toBeInTheDocument();
    expect(screen.getByText("Total lançado")).toBeInTheDocument();
    expect(screen.getByText("Filtros")).toBeInTheDocument();
    expect(screen.getByText("Despesas")).toBeInTheDocument();
    // A seeded expense description is visible.
    expect(
      screen.getByText(/Material de apoio para oficina de discovery/),
    ).toBeInTheDocument();
  });

  it("creates a draft launch (one NF, one item) and reports honest local feedback", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /Nova despesa/ }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Projeto"), {
      target: { value: "prj-atlas" },
    });
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Táxi para o cliente" },
    });
    // First (and only) item: data, valor, tipo de lançamento.
    fireEvent.change(within(dialog).getByLabelText("Valor (R$)"), {
      target: { value: "150" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tipo de lançamento"), {
      target: { value: "RIDE_SHARE" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Salvar rascunho/ }),
    );

    // Scope to the list table: the modal lingers briefly during its exit
    // animation, so query the row explicitly rather than the whole document.
    const table = within(screen.getByRole("table"));
    expect(table.getByText("Táxi para o cliente")).toBeInTheDocument();
    expect(table.getByText("Transporte/Uber")).toBeInTheDocument();
    expect(screen.getByText(/rascunho\(s\) salvo\(s\) localmente/)).toBeInTheDocument();
  });

  it("blocks submitting an expense without required fields", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /Nova despesa/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Enviar para aprovação/ }),
    );
    expect(within(dialog).getByText("Selecione um projeto.")).toBeInTheDocument();
  });

  it("requires a receipt on every item before submitting from the form", () => {
    renderDemo();
    fireEvent.click(screen.getByRole("button", { name: /Nova despesa/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Projeto"), {
      target: { value: "prj-atlas" },
    });
    fireEvent.change(within(dialog).getByLabelText("Descrição"), {
      target: { value: "Taxi para o cliente" },
    });
    fireEvent.change(within(dialog).getByLabelText("Valor (R$)"), {
      target: { value: "150" },
    });
    fireEvent.change(within(dialog).getByLabelText("Tipo de lançamento"), {
      target: { value: "RIDE_SHARE" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: /Enviar para aprovação/ }),
    );
    expect(
      within(dialog).getByText(/Anexe o comprovante de cada item/),
    ).toBeInTheDocument();
  });

  it("filters the list by status of the new chain", () => {
    renderDemo();
    // DRAFT seed is visible before filtering.
    expect(
      screen.getByText(/Material de apoio para oficina de discovery/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Paga$/ }));
    expect(
      screen.queryByText(/Material de apoio para oficina de discovery/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Estacionamento durante visita técnica/),
    ).toBeInTheDocument();
  });
});

describe("ExpensesView (db mode)", () => {
  it("renders server data without the demo banner", () => {
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[dbExpense]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable={false}
      />,
    );
    expect(screen.queryByText(/Modo demonstração/)).not.toBeInTheDocument();
    expect(screen.getByText("Despesa real de banco")).toBeInTheDocument();
  });

  it("submits a DRAFT through the server action", async () => {
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[dbExpense]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable={false}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Enviar despesa Despesa real/ }),
    );
    expect(
      await screen.findByText("Despesa enviada para aprovação."),
    ).toBeInTheDocument();
    expect(vi.mocked(submitExpense)).toHaveBeenCalledWith({ id: "exp-db-1" });
  });

  it("previews an image attachment with an <img>, not an iframe", async () => {
    vi.mocked(getReceiptUrl).mockResolvedValueOnce({
      ok: true,
      data: { url: "https://signed.example/recibo.png" },
    } as never);
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[
          {
            ...dbExpense,
            attachment: {
              fileName: "recibo.png",
              contentType: "image/png",
              size: 4096,
            },
          },
        ]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Ver comprovante de Despesa real/ }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Visualizar$/ }));

    const image = await within(dialog).findByAltText(/Comprovante: recibo.png/);
    expect(image.tagName).toBe("IMG");
    expect(image).toHaveAttribute("src", "https://signed.example/recibo.png");
  });

  it("previews a PDF attachment in an iframe", async () => {
    vi.mocked(getReceiptUrl).mockResolvedValueOnce({
      ok: true,
      data: { url: "https://signed.example/nota.pdf" },
    } as never);
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[dbExpense]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Ver comprovante de Despesa real/ }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /^Visualizar$/ }));

    const frame = await within(dialog).findByTitle(/Preview de nota.pdf/);
    expect(frame.tagName).toBe("IFRAME");
    expect(frame).toHaveAttribute("src", "https://signed.example/nota.pdf");
  });

  it("offers download-only for non-previewable attachment types", () => {
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[
          {
            ...dbExpense,
            attachment: {
              fileName: "planilha.xlsx",
              contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              size: 8192,
            },
          },
        ]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Ver comprovante de Despesa real/ }),
    );
    const dialog = screen.getByRole("dialog");
    // No in-page preview action is offered, only the download fallback.
    expect(
      within(dialog).queryByRole("button", { name: /^Visualizar$/ }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /^Baixar$/ }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/não pode ser exibido na tela/),
    ).toBeInTheDocument();
  });

  it("shows the storage-unavailable warning in the form", () => {
    render(
      <ExpensesView
        mode="db"
        consultantName="Ana Tester"
        today="2026-06-10"
        expenses={[]}
        projects={[{ id: "proj-1", name: "Portal", clientName: "Cliente X" }]}
        storageAvailable={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Nova despesa/ }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/Anexos indisponíveis: storage não configurado/),
    ).toBeInTheDocument();
  });
});
