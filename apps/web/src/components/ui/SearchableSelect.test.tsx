import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "./SearchableSelect";

function Controlled({ onChange }: { onChange?: (v: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <>
      <label htmlFor="proj">Projeto</label>
      <SearchableSelect
        id="proj"
        name="projectId"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        <option value="">Todos</option>
        <option value="p1">Atlas</option>
        <option value="p2">Ação Social</option>
        <option value="p3">Boreal</option>
      </SearchableSelect>
    </>
  );
}

describe("SearchableSelect", () => {
  it("names the combobox after the native label", () => {
    render(<Controlled />);
    expect(screen.getByRole("combobox", { name: "Projeto" })).toBeInTheDocument();
  });

  it("filters options while typing, ignoring case and accents", () => {
    render(<Controlled />);
    const input = screen.getByRole("combobox", { name: "Projeto" });
    fireEvent.change(input, { target: { value: "acao" } });
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Ação Social"]);
  });

  it("commits the highlighted option on Enter and fires onChange", () => {
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByRole("combobox", { name: "Projeto" });
    fireEvent.change(input, { target: { value: "bor" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("p3");
    expect(input).toHaveValue("Boreal");
    expect(
      (screen.getByLabelText("Projeto", { selector: "select" }) as HTMLSelectElement)
        .value,
    ).toBe("p3");
  });

  it("selects by click and restores the label on Escape", () => {
    render(<Controlled />);
    const input = screen.getByRole("combobox", { name: "Projeto" });
    fireEvent.click(input);
    fireEvent.click(screen.getByRole("option", { name: "Atlas" }));
    expect(input).toHaveValue("Atlas");

    fireEvent.change(input, { target: { value: "xyz" } });
    expect(screen.getByText("Nenhuma opção encontrada")).toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveValue("Atlas");
  });

  it("submits the option value through the native select in forms", () => {
    const { container } = render(
      <form>
        <SearchableSelect name="status" defaultValue="B" aria-label="Status">
          <option value="A">Aberto</option>
          <option value="B">Bloqueado</option>
        </SearchableSelect>
      </form>,
    );
    const form = container.querySelector("form")!;
    expect(new FormData(form).get("status")).toBe("B");
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "Bloqueado",
    );
  });
});
