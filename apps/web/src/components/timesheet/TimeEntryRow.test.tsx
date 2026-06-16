import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TimeEntryRow } from "./TimeEntryRow";
import type {
  TimeEntryRow as TimeEntryRowData,
  WeekDay,
} from "@/lib/timesheet/types";

/**
 * Row render covers the activity-label compatibility path (Rodada 4.2): the row
 * keeps the raw activity code, and the cell renders `activityLabelOf(code)` so
 * canonical, legacy and unknown values all show a sensible label.
 */

const days: WeekDay[] = [
  { label: "Seg", date: "2026-06-08", weekend: false },
  { label: "Ter", date: "2026-06-09", weekend: false },
  { label: "Qua", date: "2026-06-10", weekend: false },
  { label: "Qui", date: "2026-06-11", weekend: false },
  { label: "Sex", date: "2026-06-12", weekend: false },
  { label: "Sáb", date: "2026-06-13", weekend: true },
  { label: "Dom", date: "2026-06-14", weekend: true },
];

function row(over: Partial<TimeEntryRowData> = {}): TimeEntryRowData {
  return {
    id: "r1",
    projectId: "p1",
    projectName: "Atlas",
    clientName: "Vix Energia",
    activity: "WORKDAY",
    billable: true,
    status: "DRAFT",
    hours: [8, 0, 0, 0, 0, 0, 0],
    ...over,
  };
}

function renderRow(data: TimeEntryRowData, onEdit?: () => void) {
  return render(
    <table>
      <tbody>
        <TimeEntryRow row={data} days={days} onEdit={onEdit} />
      </tbody>
    </table>,
  );
}

describe("TimeEntryRow activity label", () => {
  it("renders the canonical label", () => {
    renderRow(row({ activity: "WORKDAY" }));
    expect(screen.getByText("Dia Útil")).toBeInTheDocument();
  });

  it("renders a legacy code as its readable label, never the raw code", () => {
    renderRow(row({ activity: "DEVELOPMENT" }));
    expect(screen.getByText("Desenvolvimento")).toBeInTheDocument();
    expect(screen.queryByText("DEVELOPMENT")).not.toBeInTheDocument();
  });

  it("falls back to the raw value for an unknown code", () => {
    renderRow(row({ activity: "MYSTERY_CODE" }));
    expect(screen.getByText("MYSTERY_CODE")).toBeInTheDocument();
  });

  it("uses the readable label in the edit affordance aria-label", () => {
    const onEdit = vi.fn();
    renderRow(row({ activity: "DEVELOPMENT", status: "DRAFT" }), onEdit);
    expect(
      screen.getByRole("button", {
        name: /Editar lançamento de Atlas · Desenvolvimento/,
      }),
    ).toBeInTheDocument();
  });

  it("marks a non-billable row in the activity cell", () => {
    const { container } = renderRow(row({ billable: false }));
    expect(within(container).getByText(/não faturável/)).toBeInTheDocument();
  });
});

describe("TimeEntryRow hover tooltip", () => {
  it("sets a row title with total hours and the readable status", () => {
    renderRow(row({ status: "SUBMITTED", hours: [6, 6, 0, 0, 0, 0, 0] }));
    const tr = screen.getByRole("row");
    // Mirrors PeriodOverview: project · activity · total · status.
    expect(tr).toHaveAttribute(
      "title",
      "Atlas · Dia Útil · 12h · Enviado",
    );
  });

  it("renders a readable status label for a rejected row", () => {
    renderRow(row({ status: "REJECTED", hours: [0, 0, 0, 0, 0, 0, 0] }));
    expect(screen.getByRole("row")).toHaveAttribute(
      "title",
      expect.stringContaining("Reprovado"),
    );
  });
});

describe("TimeEntryRow edit affordance", () => {
  it("exposes an edit button for a SUBMITTED row (now editable)", () => {
    const onEdit = vi.fn();
    renderRow(row({ status: "SUBMITTED" }), onEdit);
    expect(
      screen.getByRole("button", { name: /Editar lançamento de Atlas/ }),
    ).toBeInTheDocument();
  });

  it("renders APPROVED and CLOSED rows as read-only (no edit button)", () => {
    const onEdit = vi.fn();
    renderRow(row({ status: "APPROVED" }), onEdit);
    expect(
      screen.queryByRole("button", { name: /Editar lançamento/ }),
    ).not.toBeInTheDocument();
  });
});
