import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("combines class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("drops falsy/conditional classes", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });

  it("resolves conflicting Tailwind utilities (last wins)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4");
    expect(cn("text-soft", "text-strong")).toBe("text-strong");
  });

  it("supports arrays and conditional objects (clsx semantics)", () => {
    expect(cn(["a", { b: true, c: false }], "d")).toBe("a b d");
  });
});
