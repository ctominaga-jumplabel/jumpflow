import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimesheetWeekView } from "@/components/timesheet/TimesheetWeekView";

// Demo mode never calls the server actions or navigates; mock both so the
// component tree stays free of server-only imports in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/app/horas/actions", () => ({
  createTimeEntry: vi.fn(),
  updateTimeEntry: vi.fn(),
  deleteTimeEntry: vi.fn(),
  copyPreviousWeek: vi.fn(),
  submitWeek: vi.fn(),
  decideHours: vi.fn(),
}));
// FinancialOverview renders ExpensesFinancePanel, which wires setPayment.
vi.mock("@/app/app/despesas/actions", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
  submitExpense: vi.fn(),
  attachReceipt: vi.fn(),
  replaceReceipt: vi.fn(),
  getReceiptUrl: vi.fn(),
  setPayment: vi.fn(),
  decideAsManager: vi.fn(),
  decideAsFinance: vi.fn(),
}));
import { ConsultantDirectory } from "@/components/consultants/ConsultantDirectory";
import { CertificateList } from "@/components/certificates/CertificateList";
import { CertificateSummary } from "@/components/certificates/CertificateSummary";
import { SkillMatrix } from "@/components/skills/SkillMatrix";
import { SkillCoveragePanel } from "@/components/skills/SkillCoveragePanel";
import { FinancialOverview } from "@/components/financial/FinancialOverview";
import { certificates } from "@/lib/mock-data/certificates";
import { skills } from "@/lib/mock-data/skills";

describe("Horas — TimesheetWeekView", () => {
  it("renders the week grid and prepared actions", () => {
    render(<TimesheetWeekView mode="demo" />);
    expect(screen.getByText(/Semana 24/)).toBeInTheDocument();
    expect(screen.getByText("Lançamentos da semana")).toBeInTheDocument();
    // Rodada 4.3: no separate submit button; entries enter approval on save.
    expect(
      screen.getByRole("button", { name: /Novo lançamento/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Enviar para aprovação/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Em breve")).not.toBeInTheDocument();
  });
});

describe("Consultores — ConsultantDirectory", () => {
  it("renders consultants and filters by search", () => {
    render(<ConsultantDirectory />);
    expect(screen.getByText("Bruno Lima")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Buscar por nome/), {
      target: { value: "marina" },
    });
    expect(screen.getByText("Marina Alves")).toBeInTheDocument();
    expect(screen.queryByText("Bruno Lima")).not.toBeInTheDocument();
  });
});

describe("Certificados — list and summary", () => {
  it("renders the summary cards", () => {
    render(<CertificateSummary certificates={certificates} />);
    expect(screen.getByText("Certificados")).toBeInTheDocument();
    expect(screen.getByText("Vencidos")).toBeInTheDocument();
  });

  it("renders the urgency-sorted list", () => {
    render(<CertificateList certificates={certificates} />);
    expect(
      screen.getByText(/AWS Solutions Architect – Associate/),
    ).toBeInTheDocument();
  });
});

describe("Skills — matrix and coverage", () => {
  it("renders the matrix", () => {
    render(<SkillMatrix skills={skills} />);
    expect(screen.getByText("Matriz de skills")).toBeInTheDocument();
    expect(screen.getByText("React")).toBeInTheDocument();
  });

  it("renders the coverage gaps panel", () => {
    render(<SkillCoveragePanel skills={skills} />);
    expect(screen.getByText("Gaps de cobertura")).toBeInTheDocument();
  });
});

describe("Financeiro — FinancialOverview", () => {
  it("renders revenue KPIs and the closing table", () => {
    render(<FinancialOverview />);
    expect(screen.getByText("Receita estimada")).toBeInTheDocument();
    expect(screen.getByText("Fechamento mensal")).toBeInTheDocument();
    // Atlas appears in the closing.
    expect(screen.getByText("Atlas")).toBeInTheDocument();
  });
});
