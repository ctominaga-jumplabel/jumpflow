import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { PaginationMeta } from "@/lib/reports/types";
import { ReportPagination } from "./ReportPagination";

const PREV = "/app/relatorios?tab=horas&page=1";
const NEXT = "/app/relatorios?tab=horas&page=3";

function renderPagination(pagination: PaginationMeta) {
  return render(
    <ReportPagination
      pagination={pagination}
      prevHref={PREV}
      nextHref={NEXT}
    />,
  );
}

describe("ReportPagination — boundaries", () => {
  it("disables Anterior on page 1 (no href, tabIndex -1, aria-disabled)", () => {
    renderPagination({ total: 120, page: 1, pageSize: 50, totalPages: 3 });
    const prev = screen.getByText("Anterior").closest("a")!;
    expect(prev).toHaveAttribute("aria-disabled", "true");
    expect(prev).not.toHaveAttribute("href");
    expect(prev).toHaveAttribute("tabindex", "-1");

    // Próxima is active and carries its href.
    const next = screen.getByText("Próxima").closest("a")!;
    expect(next).toHaveAttribute("aria-disabled", "false");
    expect(next).toHaveAttribute("href", NEXT);
    expect(next).not.toHaveAttribute("tabindex");
  });

  it("disables Próxima on the last page", () => {
    renderPagination({ total: 120, page: 3, pageSize: 50, totalPages: 3 });
    const next = screen.getByText("Próxima").closest("a")!;
    expect(next).toHaveAttribute("aria-disabled", "true");
    expect(next).not.toHaveAttribute("href");
    expect(next).toHaveAttribute("tabindex", "-1");

    const prev = screen.getByText("Anterior").closest("a")!;
    expect(prev).toHaveAttribute("aria-disabled", "false");
    expect(prev).toHaveAttribute("href", PREV);
  });

  it("enables both links on a middle page", () => {
    renderPagination({ total: 120, page: 2, pageSize: 50, totalPages: 3 });
    expect(screen.getByText("Anterior").closest("a")).toHaveAttribute(
      "href",
      PREV,
    );
    expect(screen.getByText("Próxima").closest("a")).toHaveAttribute(
      "href",
      NEXT,
    );
  });

  it("disables both links on a single page (totalPages 1)", () => {
    renderPagination({ total: 10, page: 1, pageSize: 50, totalPages: 1 });
    expect(screen.getByText("Anterior").closest("a")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByText("Próxima").closest("a")).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});

describe("ReportPagination — range label", () => {
  it("renders X–Y of N for a full first page", () => {
    renderPagination({ total: 120, page: 1, pageSize: 50, totalPages: 3 });
    expect(screen.getByText("1–50")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText(/Página 1 de 3/)).toBeInTheDocument();
  });

  it("clamps the last page range to the total (partial page)", () => {
    renderPagination({ total: 120, page: 3, pageSize: 50, totalPages: 3 });
    // page 3 would be 101–150, but total is 120.
    expect(screen.getByText("101–120")).toBeInTheDocument();
  });

  it("hides the page counter when there is only one page", () => {
    renderPagination({ total: 10, page: 1, pageSize: 50, totalPages: 1 });
    expect(screen.getByText("1–10")).toBeInTheDocument();
    expect(screen.queryByText(/Página/)).not.toBeInTheDocument();
  });

  it("renders nothing when there are no results", () => {
    const { container } = renderPagination({
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
    });
    expect(container).toBeEmptyDOMElement();
  });
});
