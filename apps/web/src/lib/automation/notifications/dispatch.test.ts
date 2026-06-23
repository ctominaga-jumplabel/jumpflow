import { describe, expect, it, vi } from "vitest";
import { paragraph } from "../email/layout";
import type { EmailMessage, EmailTransport } from "../email-transport";
import type { WebhookMessage, WebhookTransport } from "../webhook-transport";
import {
  dispatchNotifications,
  groupByRecipient,
  type NotificationFragment,
} from "./dispatch";

function emailFragment(
  address: string,
  title: string,
): NotificationFragment {
  return {
    recipient: { key: address, channel: "EMAIL", address },
    title,
    blocks: [paragraph(`Conteúdo de ${title}`)],
    teamsText: title,
  };
}

class FakeEmailTransport implements EmailTransport {
  sent: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.sent.push(message);
    return { id: `email-${this.sent.length}`, provider: "fake" };
  }
}

class FakeWebhookTransport implements WebhookTransport {
  sent: WebhookMessage[] = [];
  async send(message: WebhookMessage) {
    this.sent.push(message);
    return { id: `hook-${this.sent.length}`, provider: "fake", status: 200 };
  }
}

describe("groupByRecipient", () => {
  it("groups fragments by recipient key preserving order", () => {
    const groups = groupByRecipient([
      emailFragment("a@x.com", "Projeto 1"),
      emailFragment("b@x.com", "Projeto 2"),
      emailFragment("a@x.com", "Projeto 3"),
    ]);
    expect(groups.size).toBe(2);
    expect(groups.get("a@x.com")).toHaveLength(2);
    expect(groups.get("b@x.com")).toHaveLength(1);
  });
});

describe("dispatchNotifications", () => {
  it("sends one consolidated email per recipient (agrupamento por destinatário)", async () => {
    const email = new FakeEmailTransport();
    const results = await dispatchNotifications(
      [
        emailFragment("a@x.com", "Projeto 1"),
        emailFragment("a@x.com", "Projeto 2"),
        emailFragment("b@x.com", "Projeto 3"),
      ],
      { emailTransport: email },
    );

    // 2 recipients -> 2 messages, not 3.
    expect(email.sent).toHaveLength(2);
    const consolidated = email.sent.find((m) => m.to[0] === "a@x.com");
    expect(consolidated?.subject).toContain("Resumo de notificações (2)");
    // Both fragment titles appear in the digest body.
    expect(consolidated?.html).toContain("Projeto 1");
    expect(consolidated?.html).toContain("Projeto 2");
    expect(consolidated?.text).toContain("Projeto 1");

    const single = email.sent.find((m) => m.to[0] === "b@x.com");
    expect(single?.subject).toBe("Projeto 3");

    expect(results.every((r) => r.status === "SENT")).toBe(true);
  });

  it("routes TEAMS recipients to the webhook transport", async () => {
    const email = new FakeEmailTransport();
    const hook = new FakeWebhookTransport();
    await dispatchNotifications(
      [
        {
          recipient: { key: "team-fin", channel: "TEAMS", address: "https://hook" },
          title: "Alerta financeiro",
          blocks: [],
          teamsText: "Faturamento pendente",
        },
      ],
      { emailTransport: email, webhookTransport: hook },
    );
    expect(email.sent).toHaveLength(0);
    expect(hook.sent).toHaveLength(1);
    expect(hook.sent[0].title).toBe("Alerta financeiro");
  });

  it("records a delivery entry per recipient and never throws on failure", async () => {
    const failing: EmailTransport = {
      send: vi.fn().mockRejectedValue(new Error("smtp down")),
    };
    const log = vi.fn();
    const results = await dispatchNotifications(
      [emailFragment("a@x.com", "Projeto 1")],
      { emailTransport: failing, recordDelivery: log },
    );
    expect(results[0].status).toBe("FAILED");
    expect(results[0].error).toContain("smtp down");
    expect(log).toHaveBeenCalledTimes(1);
  });
});
