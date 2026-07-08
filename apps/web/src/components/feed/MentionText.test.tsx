import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MentionText, collectActiveMentionIds } from "./MentionText";

describe("MentionText highlight", () => {
  it("highlights only @names that are confirmed mentions", () => {
    const { container } = render(
      <MentionText
        text="Oi @Ana Lima, veja com @Bia Souza. cc @NaoMencionado"
        mentions={[
          { userId: "u1", name: "Ana Lima" },
          { userId: "u2", name: "Bia Souza" },
        ]}
      />,
    );
    const marks = [...container.querySelectorAll("[data-mention]")].map(
      (n) => n.textContent,
    );
    expect(marks).toEqual(["@Ana Lima", "@Bia Souza"]);
    // The unpicked "@NaoMencionado" stays plain text.
    expect(container.textContent).toContain("@NaoMencionado");
  });

  it("does not highlight a bare name with no mentions", () => {
    const { container } = render(
      <MentionText text="sem menção aqui" mentions={[]} />,
    );
    expect(container.querySelector("[data-mention]")).toBeNull();
    expect(container.textContent).toBe("sem menção aqui");
  });

  it("does not match a name glued inside another word (boundaries)", () => {
    const { container } = render(
      <MentionText
        text="email@Ana.com e @Anabela não contam"
        mentions={[{ userId: "u1", name: "Ana" }]}
      />,
    );
    // "@Ana" inside "email@Ana.com" (preceded by a word char) and inside
    // "@Anabela" (followed by a letter) must NOT be highlighted.
    expect(container.querySelector("[data-mention]")).toBeNull();
  });

  it("prefers the longest matching name (Ana Paula over Ana)", () => {
    const { container } = render(
      <MentionText
        text="oi @Ana Paula"
        mentions={[
          { userId: "u1", name: "Ana" },
          { userId: "u2", name: "Ana Paula" },
        ]}
      />,
    );
    const marks = [...container.querySelectorAll("[data-mention]")].map(
      (n) => n.textContent,
    );
    expect(marks).toEqual(["@Ana Paula"]);
  });
});

describe("collectActiveMentionIds", () => {
  const picked = [
    { id: "u1", name: "Ana Lima" },
    { id: "u2", name: "Bia Souza" },
  ];

  it("returns ids whose @name is still present in the body", () => {
    expect(collectActiveMentionIds("Obrigado @Ana Lima!", picked)).toEqual([
      "u1",
    ]);
  });

  it("drops a picked user whose text was deleted", () => {
    expect(collectActiveMentionIds("sem ninguém", picked)).toEqual([]);
  });

  it("dedupes and returns both when both are present", () => {
    const ids = collectActiveMentionIds("@Ana Lima e @Bia Souza e @Ana Lima", picked);
    expect(ids.sort()).toEqual(["u1", "u2"]);
  });

  it("requires the @ prefix (a plain name is not a mention)", () => {
    expect(collectActiveMentionIds("Ana Lima esteve aqui", picked)).toEqual([]);
  });
});
