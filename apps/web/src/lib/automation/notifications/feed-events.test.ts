import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Feed notifications (Melhoria #5) — unit tests.
 *
 * Cobre as regras de produto exigidas:
 *  - pular auto-notificação (ator == autor do alvo);
 *  - idempotência por dedupeKey (reactionId/commentId via AutomationEmailLog);
 *  - agrupamento por destinatário: múltiplas reações viram UM único digest;
 *  - fail-open: sem NotificationRule ativa, nada é enviado.
 *
 * Mockamos `@jumpflow/database` com um store em memória e o transporte de e-mail
 * (mesma estratégia do emit.test.ts).
 */

interface CommentRow {
  id: string;
  status: string;
  authorUserId: string | null;
  authorName: string | null;
  authorEmail: string | null; // e-mail do autor do COMENTÁRIO (para reações)
  postId: string;
}

interface PostRow {
  id: string;
  status: string;
  authorUserId: string | null;
  authorName: string | null;
  authorEmail: string | null;
}

interface ReactionRow {
  id: string;
  emoji: string;
  userId: string;
  userName: string;
  postId: string | null;
  commentId: string | null;
  createdAt: number;
}

const h = vi.hoisted(() => {
  const store = {
    ruleActiveEvents: new Set<string>(),
    posts: [] as PostRow[],
    comments: [] as CommentRow[],
    reactions: [] as ReactionRow[],
    sentRefs: new Set<string>(),
    upserts: [] as Array<{ referenceKey: string; status: string }>,
    sent: [] as Array<{ to: string[]; subject: string; text: string }>,
  };

  const prismaMock = {
    notificationRule: {
      count: async ({ where }: { where: { event: string; active: boolean } }) =>
        where.active && store.ruleActiveEvents.has(where.event) ? 1 : 0,
    },
    feedPost: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const p = store.posts.find((x) => x.id === where.id);
        if (!p) return null;
        return {
          status: p.status,
          authorUserId: p.authorUserId,
          author: p.authorEmail
            ? { id: p.authorUserId, name: p.authorName, email: p.authorEmail }
            : null,
        };
      },
    },
    feedComment: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const c = store.comments.find((x) => x.id === where.id);
        if (!c) return null;
        const post = store.posts.find((p) => p.id === c.postId);
        return {
          id: c.id,
          status: c.status,
          authorUserId: c.authorUserId,
          author: c.authorEmail
            ? { id: c.authorUserId, name: c.authorName, email: c.authorEmail }
            : { id: c.authorUserId, name: c.authorName },
          post: post
            ? {
                status: post.status,
                authorUserId: post.authorUserId,
                author: post.authorEmail
                  ? {
                      id: post.authorUserId,
                      name: post.authorName,
                      email: post.authorEmail,
                    }
                  : null,
              }
            : null,
        };
      },
    },
    feedReaction: {
      findMany: async ({
        where,
      }: {
        where: {
          postId?: string;
          commentId?: string;
          userId: { not: string };
        };
        orderBy?: unknown;
      }) =>
        store.reactions
          .filter((r) => {
            if (where.postId !== undefined && r.postId !== where.postId)
              return false;
            if (where.commentId !== undefined && r.commentId !== where.commentId)
              return false;
            if (r.userId === where.userId.not) return false;
            return true;
          })
          .sort((a, b) => a.createdAt - b.createdAt)
          .map((r) => ({
            id: r.id,
            emoji: r.emoji,
            user: { name: r.userName },
          })),
    },
    automationEmailLog: {
      findMany: async ({
        where,
      }: {
        where: { referenceKey: { in: string[] } };
      }) =>
        where.referenceKey.in
          .filter((ref) => store.sentRefs.has(ref))
          .map((ref) => ({ referenceKey: ref })),
      upsert: async ({
        create,
      }: {
        create: { referenceKey: string; status: string };
      }) => {
        store.upserts.push({
          referenceKey: create.referenceKey,
          status: create.status,
        });
        if (create.status === "SENT") store.sentRefs.add(create.referenceKey);
        return create;
      },
    },
  };

  return { store, prismaMock };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: { JsonNull: "__JsonNull__" },
}));

vi.mock("@/lib/automation/email-transport", () => ({
  getEmailTransport: () => ({
    send: async (message: { to: string[]; subject: string; text: string }) => {
      h.store.sent.push(message);
      return { id: `msg-${h.store.sent.length}`, provider: "test" };
    },
  }),
}));

vi.mock("@/lib/automation/webhook-transport", () => ({
  getWebhookTransport: () => ({
    send: async () => ({ id: "webhook", provider: "test" }),
  }),
}));

import { notifyFeedReacted, notifyFeedReplied } from "./feed-events";

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.ruleActiveEvents = new Set([
    "FEED_POST_REPLIED",
    "FEED_CONTENT_REACTED",
  ]);
  h.store.posts = [
    {
      id: "post-1",
      status: "VISIBLE",
      authorUserId: "author-1",
      authorName: "Ana",
      authorEmail: "ana@x.com",
    },
  ];
  h.store.comments = [];
  h.store.reactions = [];
  h.store.sentRefs = new Set();
  h.store.upserts = [];
  h.store.sent = [];
});

// ── FEED_POST_REPLIED ───────────────────────────────────────────────────────

describe("notifyFeedReplied", () => {
  it("notifies the post author when someone else replies", async () => {
    h.store.comments = [
      {
        id: "c-1",
        status: "VISIBLE",
        authorUserId: "user-2",
        authorName: "Bruno",
        authorEmail: "bruno@x.com",
        postId: "post-1",
      },
    ];

    await notifyFeedReplied("c-1");

    expect(h.store.sent).toHaveLength(1);
    expect(h.store.sent[0].to).toEqual(["ana@x.com"]);
    expect(h.store.sent[0].text).toContain("Bruno respondeu seu post");
    expect(h.store.upserts).toHaveLength(1);
    expect(h.store.upserts[0].referenceKey).toBe("FEED_POST_REPLIED:c-1");
  });

  it("skips self-notification (replier == post author)", async () => {
    h.store.comments = [
      {
        id: "c-self",
        status: "VISIBLE",
        authorUserId: "author-1", // == post author
        authorName: "Ana",
        authorEmail: "ana@x.com",
        postId: "post-1",
      },
    ];

    await notifyFeedReplied("c-self");

    expect(h.store.sent).toHaveLength(0);
    expect(h.store.upserts).toHaveLength(0);
  });

  it("is idempotent: a second call for the same comment sends nothing", async () => {
    h.store.comments = [
      {
        id: "c-2",
        status: "VISIBLE",
        authorUserId: "user-2",
        authorName: "Bruno",
        authorEmail: "bruno@x.com",
        postId: "post-1",
      },
    ];

    await notifyFeedReplied("c-2");
    h.store.sent = [];
    await notifyFeedReplied("c-2");

    expect(h.store.sent).toHaveLength(0);
  });

  it("fail-open: sends nothing without an active rule", async () => {
    h.store.ruleActiveEvents = new Set();
    h.store.comments = [
      {
        id: "c-3",
        status: "VISIBLE",
        authorUserId: "user-2",
        authorName: "Bruno",
        authorEmail: "bruno@x.com",
        postId: "post-1",
      },
    ];

    await notifyFeedReplied("c-3");

    expect(h.store.sent).toHaveLength(0);
  });
});

// ── FEED_CONTENT_REACTED ─────────────────────────────────────────────────────

describe("notifyFeedReacted", () => {
  it("consolidates multiple PENDING reactions in a SINGLE call into one digest", async () => {
    // Caso de consolidação real: duas reações pendentes (nenhuma logada SENT)
    // visíveis numa única chamada → um e-mail só. Acontece, p.ex., quando um
    // envio anterior falhou e ambas ficaram pendentes.
    h.store.reactions = [
      {
        id: "r-1",
        emoji: "👍",
        userId: "user-2",
        userName: "Bruno",
        postId: "post-1",
        commentId: null,
        createdAt: 1,
      },
      {
        id: "r-2",
        emoji: "🎉",
        userId: "user-3",
        userName: "Carla",
        postId: "post-1",
        commentId: null,
        createdAt: 2,
      },
    ];

    await notifyFeedReacted({ postId: "post-1" });

    // Um único e-mail consolidado para a autora do post.
    expect(h.store.sent).toHaveLength(1);
    expect(h.store.sent[0].to).toEqual(["ana@x.com"]);
    expect(h.store.sent[0].text).toContain("Bruno reagiu 👍 a seu post");
    expect(h.store.sent[0].text).toContain("Carla reagiu 🎉 a seu post");
    // Idempotência POR REAÇÃO: uma linha de log por reactionId.
    expect(h.store.upserts.map((u) => u.referenceKey).sort()).toEqual([
      "FEED_CONTENT_REACTED:r-1",
      "FEED_CONTENT_REACTED:r-2",
    ]);
  });

  it("CONTRATO REAL (A1): reações de usuários distintos em chamadas separadas geram um e-mail cada (sem janela de digest)", async () => {
    // Modela o fluxo real: cada clique vira uma chamada própria. Reação de
    // Bruno → notifica (1 e-mail) e marca r-1 SENT. Depois Carla reage → nova
    // chamada vê r-2 pendente (r-1 já SENT, é pulada) → mais 1 e-mail. NÃO há
    // janela que junte as duas: total = 2 e-mails. (Digest por janela é
    // evolução futura — ver docs/infra-notificacoes.md §10.)
    h.store.reactions = [
      {
        id: "r-1",
        emoji: "👍",
        userId: "user-2",
        userName: "Bruno",
        postId: "post-1",
        commentId: null,
        createdAt: 1,
      },
    ];
    await notifyFeedReacted({ postId: "post-1" }); // clique do Bruno

    h.store.reactions.push({
      id: "r-2",
      emoji: "🎉",
      userId: "user-3",
      userName: "Carla",
      postId: "post-1",
      commentId: null,
      createdAt: 2,
    });
    await notifyFeedReacted({ postId: "post-1" }); // clique da Carla

    // Um e-mail por reação nova — não um único digest consolidado.
    expect(h.store.sent).toHaveLength(2);
    expect(h.store.sent[0].text).toContain("Bruno reagiu 👍 a seu post");
    expect(h.store.sent[0].text).not.toContain("Carla");
    expect(h.store.sent[1].text).toContain("Carla reagiu 🎉 a seu post");
    expect(h.store.sent[1].text).not.toContain("Bruno"); // r-1 já SENT, pulada
    // Idempotente por reactionId: cada reação logada exatamente uma vez.
    expect(h.store.upserts.map((u) => u.referenceKey).sort()).toEqual([
      "FEED_CONTENT_REACTED:r-1",
      "FEED_CONTENT_REACTED:r-2",
    ]);
  });

  it("excludes the author's own reactions (no self-notification)", async () => {
    h.store.reactions = [
      {
        id: "r-own",
        emoji: "👍",
        userId: "author-1", // a própria autora reagiu
        userName: "Ana",
        postId: "post-1",
        commentId: null,
        createdAt: 1,
      },
    ];

    await notifyFeedReacted({ postId: "post-1" });

    expect(h.store.sent).toHaveLength(0);
  });

  it("is idempotent per reaction: already-notified reactions are not re-sent", async () => {
    h.store.reactions = [
      {
        id: "r-1",
        emoji: "👍",
        userId: "user-2",
        userName: "Bruno",
        postId: "post-1",
        commentId: null,
        createdAt: 1,
      },
    ];

    await notifyFeedReacted({ postId: "post-1" });
    expect(h.store.sent).toHaveLength(1);

    // Uma nova reação chega; só ela deve entrar no novo digest.
    h.store.sent = [];
    h.store.reactions.push({
      id: "r-2",
      emoji: "🎉",
      userId: "user-3",
      userName: "Carla",
      postId: "post-1",
      commentId: null,
      createdAt: 2,
    });

    await notifyFeedReacted({ postId: "post-1" });

    expect(h.store.sent).toHaveLength(1);
    expect(h.store.sent[0].text).toContain("Carla reagiu 🎉 a seu post");
    expect(h.store.sent[0].text).not.toContain("Bruno");

    // Re-rodar sem reações novas: nada a enviar.
    h.store.sent = [];
    await notifyFeedReacted({ postId: "post-1" });
    expect(h.store.sent).toHaveLength(0);
  });

  it("notifies the comment author when a comment is reacted", async () => {
    h.store.comments = [
      {
        id: "cmt-1",
        status: "VISIBLE",
        authorUserId: "author-9",
        authorName: "Dora",
        authorEmail: "dora@x.com",
        postId: "post-1",
      },
    ];
    h.store.reactions = [
      {
        id: "rc-1",
        emoji: "❤️",
        userId: "user-2",
        userName: "Bruno",
        postId: null,
        commentId: "cmt-1",
        createdAt: 1,
      },
    ];

    await notifyFeedReacted({ commentId: "cmt-1" });

    expect(h.store.sent).toHaveLength(1);
    expect(h.store.sent[0].to).toEqual(["dora@x.com"]);
    expect(h.store.sent[0].text).toContain("Bruno reagiu ❤️ a seu comentário");
  });

  it("fail-open: sends nothing without an active rule", async () => {
    h.store.ruleActiveEvents = new Set();
    h.store.reactions = [
      {
        id: "r-1",
        emoji: "👍",
        userId: "user-2",
        userName: "Bruno",
        postId: "post-1",
        commentId: null,
        createdAt: 1,
      },
    ];

    await notifyFeedReacted({ postId: "post-1" });

    expect(h.store.sent).toHaveLength(0);
  });

  it("no-ops without throwing when the database is not configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    await expect(notifyFeedReacted({ postId: "post-1" })).resolves.toBeUndefined();
    expect(h.store.sent).toHaveLength(0);
  });
});
