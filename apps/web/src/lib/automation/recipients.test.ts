import { describe, expect, it } from "vitest";
import { parseRecipients } from "@jumpflow/shared";

describe("parseRecipients", () => {
  it("trims, lowercases, dedupes and preserves first-seen order", () => {
    expect(parseRecipients("a@x.com, B@X.com ,a@x.com")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("drops invalid and blank fragments", () => {
    expect(parseRecipients("foo, , ok@x.com,   ,bad@,@bad.com")).toEqual([
      "ok@x.com",
    ]);
  });

  it("returns an empty list for null/undefined/empty input", () => {
    expect(parseRecipients(null)).toEqual([]);
    expect(parseRecipients(undefined)).toEqual([]);
    expect(parseRecipients("")).toEqual([]);
    expect(parseRecipients("   ")).toEqual([]);
  });

  it("returns an empty list when nothing is valid", () => {
    expect(parseRecipients("foo,bar,baz")).toEqual([]);
  });

  it("keeps a single valid recipient", () => {
    expect(parseRecipients("Admin@Jump.com")).toEqual(["admin@jump.com"]);
  });
});
