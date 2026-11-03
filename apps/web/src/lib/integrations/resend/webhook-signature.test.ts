import { describe, expect, it } from "vitest";
import { signResendWebhook, verifyResendWebhook } from "./webhook-signature";

const secret = `whsec_${Buffer.from("segredo-de-teste-32-bytes-123456").toString("base64")}`;
const body = JSON.stringify({ type: "email.received", data: { email_id: "e1" } });
const now = new Date("2026-10-30T12:00:00.000Z");
const timestamp = String(Math.floor(now.getTime() / 1000));

describe("verifyResendWebhook (Svix)", () => {
  it("aceita assinatura válida, inclusive entre várias", () => {
    const signature = signResendWebhook({ id: "msg_1", timestamp, body, secret });
    expect(verifyResendWebhook({ headers: { id: "msg_1", timestamp, signature }, body, secret, now })).toBe(true);
    expect(
      verifyResendWebhook({ headers: { id: "msg_1", timestamp, signature: `v1,AAAA ${signature}` }, body, secret, now }),
    ).toBe(true);
  });
  it("rejeita corpo alterado, outro segredo, headers ausentes e replay", () => {
    const signature = signResendWebhook({ id: "msg_1", timestamp, body, secret });
    expect(verifyResendWebhook({ headers: { id: "msg_1", timestamp, signature }, body: `${body} `, secret, now })).toBe(false);
    expect(
      verifyResendWebhook({
        headers: { id: "msg_1", timestamp, signature },
        body,
        secret: `whsec_${Buffer.from("outro").toString("base64")}`,
        now,
      }),
    ).toBe(false);
    expect(verifyResendWebhook({ headers: { id: null, timestamp, signature }, body, secret, now })).toBe(false);
    const later = new Date(now.getTime() + 10 * 60 * 1000);
    expect(verifyResendWebhook({ headers: { id: "msg_1", timestamp, signature }, body, secret, now: later })).toBe(false);
  });
});
