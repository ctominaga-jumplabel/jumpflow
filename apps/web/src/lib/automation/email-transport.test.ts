import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getEmailTransport,
  type EmailMessage,
} from "@/lib/automation/email-transport";

const CSV_CONTENT = "header\r\ndata,ção\r\n";

function message(over: Partial<EmailMessage> = {}): EmailMessage {
  return {
    to: ["a@x.com", "b@x.com"],
    subject: "Subject",
    text: "Body",
    attachments: [
      {
        filename: "report.csv",
        content: CSV_CONTENT,
        contentType: "text/csv; charset=utf-8",
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getEmailTransport — console provider", () => {
  it("uses the console transport when EMAIL_PROVIDER is unset", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "");
    const result = await getEmailTransport().send(message());
    expect(result.provider).toBe("console");
    expect(result.id).toBeTruthy();
  });

  it("uses the console transport when EMAIL_PROVIDER=console", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "console");
    const result = await getEmailTransport().send(message());
    expect(result.provider).toBe("console");
    expect(result.id).toBeTruthy();
  });
});

describe("getEmailTransport — resend provider", () => {
  it("posts to the Resend API with base64 attachments and returns its id", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@x.com");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "resend-123" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getEmailTransport().send(message());
    expect(result.provider).toBe("resend");
    expect(result.id).toBe("resend-123");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(url).toBe("https://api.resend.com/emails");

    const body = JSON.parse(init.body);
    expect(body.to).toEqual(["a@x.com", "b@x.com"]);
    expect(body.from).toBe("no-reply@x.com");

    const base64 = body.attachments[0].content;
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    expect(decoded).toBe(CSV_CONTENT);
  });

  it("passes inline (base64) attachments through without re-encoding and maps content_id", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@x.com");

    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "resend-123" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const pngBase64 = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64");
    await getEmailTransport().send(
      message({
        html: '<img src="cid:logo" alt="x" />',
        attachments: [
          {
            filename: "logo.png",
            content: pngBase64,
            contentType: "image/png",
            contentId: "logo",
            encoding: "base64",
          },
        ],
      }),
    );

    // Only the Resend POST — no brand asset to fetch (cid:logo isn't a brand id).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    const att = JSON.parse(init.body).attachments[0];
    // base64 content is forwarded verbatim (not double-encoded).
    expect(att.content).toBe(pngBase64);
    expect(att.content_type).toBe("image/png");
    expect(att.content_id).toBe("logo");
  });

  it("throws a safe error (no api key) when Resend responds with a failure", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@x.com");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ message: "bad" }),
      })),
    );

    await expect(getEmailTransport().send(message())).rejects.toThrow(
      /422.*bad/,
    );

    // The api key must never leak into the thrown error.
    try {
      await getEmailTransport().send(message());
      throw new Error("expected a rejection");
    } catch (err) {
      expect(String((err as Error).message)).not.toContain("re_test");
    }
  });

  it("falls back to console (no fetch) when EMAIL_PROVIDER=resend but RESEND_API_KEY is missing", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@x.com");

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await getEmailTransport().send(message());
    expect(result.provider).toBe("console");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
