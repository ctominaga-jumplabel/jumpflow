import { describe, expect, it } from "vitest";
import { getNfseProvider } from "./provider";

describe("NFS-e provider", () => {
  it("fails honestly when no provider is configured", async () => {
    const result = await getNfseProvider().requestIssue({
      fiscalDocumentId: "doc-1",
      revenueClosingId: "closing-1",
      clientId: "client-1",
      amount: 1000,
    });

    expect(result).toMatchObject({
      ok: false,
      error: "INVALID_INPUT",
    });
  });
});
