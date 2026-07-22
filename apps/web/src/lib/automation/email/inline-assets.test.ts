import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force a known app origin so the brand logo URLs resolve regardless of the
// test env's NEXT_PUBLIC_APP_URL (appConfig reads it at module load).
vi.mock("@/config/app", () => ({
  appConfig: {
    logoUrl: "https://app.example/brand/jumpflow-logo.png",
    company: {
      name: "Jump",
      logoUrl: "https://app.example/brand/jump-logo.png",
    },
  },
}));

import {
  COMPANY_LOGO_CID,
  PRODUCT_LOGO_CID,
  __clearInlineAssetCache,
  inlinePreviewHtml,
  withInlineBrandAssets,
} from "./inline-assets";
import type { EmailMessage } from "../email-transport";

function base(over: Partial<EmailMessage> = {}): EmailMessage {
  return { to: ["a@x.com"], subject: "S", text: "T", ...over };
}

function pngResponse(bytes = [0x89, 0x50, 0x4e, 0x47]) {
  return {
    ok: true,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  };
}

beforeEach(() => {
  __clearInlineAssetCache();
  vi.unstubAllGlobals();
});

afterEach(() => {
  __clearInlineAssetCache();
  vi.unstubAllGlobals();
});

describe("withInlineBrandAssets", () => {
  it("attaches the product logo inline when the HTML references its cid", async () => {
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal("fetch", fetchMock);

    const out = await withInlineBrandAssets(
      base({ html: `<img src="cid:${PRODUCT_LOGO_CID}" />` }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://app.example/brand/jumpflow-logo.png",
    );
    expect(out.attachments).toHaveLength(1);
    const att = out.attachments![0];
    expect(att.contentId).toBe(PRODUCT_LOGO_CID);
    expect(att.encoding).toBe("base64");
    expect(att.disposition).toBe("inline");
    expect(att.contentType).toBe("image/png");
    // base64 of [0x89,0x50,0x4e,0x47]
    expect(att.content).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"));
  });

  it("memoizes the fetched bytes across calls", async () => {
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal("fetch", fetchMock);

    const html = `<img src="cid:${PRODUCT_LOGO_CID}" />`;
    await withInlineBrandAssets(base({ html }));
    await withInlineBrandAssets(base({ html }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("attaches only the logos actually referenced", async () => {
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal("fetch", fetchMock);

    const out = await withInlineBrandAssets(
      base({ html: `<img src="cid:${COMPANY_LOGO_CID}" />` }),
    );

    expect(out.attachments).toHaveLength(1);
    expect(out.attachments![0].contentId).toBe(COMPANY_LOGO_CID);
  });

  it("returns the message untouched when there is no HTML (no fetch)", async () => {
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal("fetch", fetchMock);

    const msg = base();
    const out = await withInlineBrandAssets(msg);

    expect(out).toBe(msg);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not attach when the cid is not referenced", async () => {
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal("fetch", fetchMock);

    const out = await withInlineBrandAssets(
      base({ html: "<p>sem logo</p>" }),
    );

    expect(out.attachments).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("skips gracefully (no throw) when the asset fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const out = await withInlineBrandAssets(
      base({ html: `<img src="cid:${PRODUCT_LOGO_CID}" />` }),
    );

    expect(out.attachments ?? []).toHaveLength(0);
  });

  it("does not duplicate a logo already attached by content-id", async () => {
    const fetchMock = vi.fn(async () => pngResponse());
    vi.stubGlobal("fetch", fetchMock);

    const out = await withInlineBrandAssets(
      base({
        html: `<img src="cid:${PRODUCT_LOGO_CID}" />`,
        attachments: [
          {
            filename: "jumpflow-logo.png",
            content: "already",
            contentType: "image/png",
            contentId: PRODUCT_LOGO_CID,
            encoding: "base64",
          },
        ],
      }),
    );

    expect(out.attachments).toHaveLength(1);
    expect(out.attachments![0].content).toBe("already");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("inlinePreviewHtml", () => {
  it("swaps cid refs back to the public https URL", () => {
    const html = `<img src="cid:${PRODUCT_LOGO_CID}" /><img src="cid:${COMPANY_LOGO_CID}" />`;
    const out = inlinePreviewHtml(html);
    expect(out).toContain("https://app.example/brand/jumpflow-logo.png");
    expect(out).toContain("https://app.example/brand/jump-logo.png");
    expect(out).not.toContain("cid:");
  });
});
