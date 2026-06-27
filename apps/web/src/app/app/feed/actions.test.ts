import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Server-action + read-layer tests for the Feed social interno (Melhoria #5),
 * with a stateful in-memory Prisma mock (same pattern as despesas/actions.test).
 * The mock honors only the where/select shapes the code actually issues.
 */

interface PostRec {
  id: string;
  authorUserId: string | null;
  body: string;
  visibility: string;
  status: string;
  pinned: boolean;
  removedByUserId: string | null;
  removedAt: Date | null;
  removalReason: string | null;
  editedAt: Date | null;
  createdAt: Date;
}
interface CommentRec {
  id: string;
  postId: string;
  authorUserId: string | null;
  body: string;
  status: string;
  editedAt: Date | null;
  createdAt: Date;
}
interface ReactionRec {
  id: string;
  emoji: string;
  userId: string;
  postId: string | null;
  commentId: string | null;
}
interface AttachmentRec {
  id: string;
  postId: string;
  fileName: string;
  contentType: string;
  size: number;
  storageBucket: string;
  storageKey: string;
  uploadedByUserId: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Where = Record<string, any>;

const h = vi.hoisted(() => {
  // Minimal stand-in for Prisma's known-request error (the action checks .code).
  // Defined inside the hoisted block so the @jumpflow/database mock factory
  // (also hoisted) can reference it without a TDZ error.
  class PrismaClientKnownRequestError extends Error {
    code: string;
    constructor(message: string, opts: { code: string }) {
      super(message);
      this.name = "PrismaClientKnownRequestError";
      this.code = opts.code;
    }
  }

  const store = {
    posts: [] as PostRec[],
    comments: [] as CommentRec[],
    reactions: [] as ReactionRec[],
    attachments: [] as AttachmentRec[],
    audits: [] as Record<string, unknown>[],
    // The acting user. `dbUserId` is the resolved db row id (FK target).
    currentUser: {
      id: "dev-user",
      email: "ana@jumplabel.com.br",
      roles: ["CONSULTANT"] as string[],
    },
    dbUserId: "user-1",
    // Toggles for the mocked auth collaborators.
    can: { view: true, create: true, edit: true, delete: false },
    moderator: false,
    storageConfigured: false,
    seq: 0,
    // simulate a P2002 on the next reaction create (race)
    forceReactionConflict: false,
  };

  const nextId = (prefix: string) => `${prefix}-${++store.seq}`;

  function matchPost(p: PostRec, where: Where): boolean {
    if (where.id !== undefined && p.id !== where.id) return false;
    if (where.authorUserId !== undefined && p.authorUserId !== where.authorUserId)
      return false;
    if (where.status !== undefined && p.status !== where.status) return false;
    if (where.pinned !== undefined && p.pinned !== where.pinned) return false;
    return true;
  }
  function matchComment(c: CommentRec, where: Where): boolean {
    if (where.id !== undefined && c.id !== where.id) return false;
    if (where.authorUserId !== undefined && c.authorUserId !== where.authorUserId)
      return false;
    if (where.status !== undefined && c.status !== where.status) return false;
    return true;
  }

  const txClient = () => prismaMock;

  const prismaMock = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(txClient()),
    feedPost: {
      findUnique: async ({ where, select }: { where: Where; select?: Where }) => {
        const post = store.posts.find((p) => p.id === where.id);
        if (!post) return null;
        const out: Record<string, unknown> = { ...post };
        if (select?._count) {
          out._count = {
            attachments: store.attachments.filter((a) => a.postId === post.id)
              .length,
          };
        }
        return out;
      },
      findMany: async ({
        where,
        take,
      }: {
        where?: Where;
        select?: Where;
        orderBy?: unknown;
        take?: number;
      }) => {
        let rows = store.posts.filter((p) => {
          if (where?.visibility?.in && !where.visibility.in.includes(p.visibility))
            return false;
          if (where?.OR) {
            const ok = (where.OR as Where[]).some((cond) => {
              if (cond.pinned !== undefined && p.pinned !== cond.pinned)
                return false;
              if (cond.createdAt?.lt && !(p.createdAt < cond.createdAt.lt))
                return false;
              if (
                cond.createdAt instanceof Date &&
                p.createdAt.getTime() !== cond.createdAt.getTime()
              )
                return false;
              if (cond.id?.lt && !(p.id < cond.id.lt)) return false;
              return true;
            });
            if (!ok) return false;
          }
          return true;
        });
        // (pinned desc, createdAt desc, id desc)
        rows = rows.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          if (a.createdAt.getTime() !== b.createdAt.getTime())
            return b.createdAt.getTime() - a.createdAt.getTime();
          return b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
        });
        const sliced = take ? rows.slice(0, take) : rows;
        return sliced.map((p) => projectPost(p));
      },
      count: async ({ where }: { where: Where }) =>
        store.posts.filter((p) => matchPost(p, where)).length,
      create: async ({ data }: { data: Where }) => {
        const post: PostRec = {
          id: nextId("post"),
          authorUserId: data.authorUserId ?? null,
          body: data.body,
          visibility: data.visibility ?? "PUBLIC_INTERNAL",
          status: data.status ?? "VISIBLE",
          pinned: data.pinned ?? false,
          removedByUserId: null,
          removedAt: null,
          removalReason: null,
          editedAt: null,
          createdAt: new Date(Date.now() + store.seq),
        };
        store.posts.push(post);
        return { ...post };
      },
      update: async ({ where, data }: { where: Where; data: Where }) => {
        const post = store.posts.find((p) => p.id === where.id)!;
        Object.assign(post, data);
        return { ...post };
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        const matched = store.posts.filter((p) => matchPost(p, where));
        for (const p of matched) Object.assign(p, data);
        return { count: matched.length };
      },
    },
    feedComment: {
      findUnique: async ({ where }: { where: Where }) => {
        const c = store.comments.find((x) => x.id === where.id);
        return c ? { ...c } : null;
      },
      create: async ({ data }: { data: Where }) => {
        const comment: CommentRec = {
          id: nextId("comment"),
          postId: data.postId,
          authorUserId: data.authorUserId ?? null,
          body: data.body,
          status: data.status ?? "VISIBLE",
          editedAt: null,
          createdAt: new Date(Date.now() + store.seq),
        };
        store.comments.push(comment);
        return { ...comment };
      },
      updateMany: async ({ where, data }: { where: Where; data: Where }) => {
        const matched = store.comments.filter((c) => matchComment(c, where));
        for (const c of matched) Object.assign(c, data);
        return { count: matched.length };
      },
    },
    feedReaction: {
      findFirst: async ({ where }: { where: Where }) => {
        const r = store.reactions.find(
          (x) =>
            x.userId === where.userId &&
            x.emoji === where.emoji &&
            (where.postId !== undefined
              ? x.postId === where.postId
              : x.commentId === where.commentId),
        );
        return r ? { id: r.id } : null;
      },
      create: async ({ data }: { data: Where }) => {
        if (store.forceReactionConflict) {
          store.forceReactionConflict = false;
          throw new PrismaClientKnownRequestError("Unique constraint", {
            code: "P2002",
          });
        }
        const reaction: ReactionRec = {
          id: nextId("reaction"),
          emoji: data.emoji,
          userId: data.userId,
          postId: data.postId ?? null,
          commentId: data.commentId ?? null,
        };
        store.reactions.push(reaction);
        return { ...reaction };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const before = store.reactions.length;
        store.reactions = store.reactions.filter((r) => r.id !== where.id);
        return { count: before - store.reactions.length };
      },
    },
    feedPostAttachment: {
      findUnique: async ({ where }: { where: Where }) => {
        const a = store.attachments.find((x) => x.id === where.id);
        if (!a) return null;
        const post = store.posts.find((p) => p.id === a.postId)!;
        return { ...a, post: { authorUserId: post.authorUserId } };
      },
      create: async ({ data }: { data: Where }) => {
        const attachment: AttachmentRec = {
          id: nextId("att"),
          postId: data.postId,
          fileName: data.fileName,
          contentType: data.contentType,
          size: data.size,
          storageBucket: data.storageBucket,
          storageKey: data.storageKey,
          uploadedByUserId: data.uploadedByUserId ?? null,
        };
        store.attachments.push(attachment);
        return { ...attachment };
      },
      delete: async ({ where }: { where: Where }) => {
        const i = store.attachments.findIndex((a) => a.id === where.id);
        const [removed] = store.attachments.splice(i, 1);
        return removed;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        store.audits.push(data);
        return { id: nextId("audit"), ...data };
      },
    },
  };

  /** Shape a post like the read layer's `select` (author, reactions, comments). */
  function projectPost(p: PostRec) {
    return {
      ...p,
      author: p.authorUserId ? { name: `User ${p.authorUserId}` } : null,
      reactions: store.reactions
        .filter((r) => r.postId === p.id)
        .map((r) => ({ emoji: r.emoji, userId: r.userId })),
      attachments: store.attachments
        .filter((a) => a.postId === p.id)
        .map((a) => ({
          id: a.id,
          fileName: a.fileName,
          contentType: a.contentType,
          size: a.size,
        })),
      comments: store.comments
        .filter((c) => c.postId === p.id && c.status === "VISIBLE")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 3)
        .map((c) => ({
          ...c,
          author: c.authorUserId ? { name: `User ${c.authorUserId}` } : null,
          reactions: store.reactions
            .filter((r) => r.commentId === c.id)
            .map((r) => ({ emoji: r.emoji, userId: r.userId })),
        })),
      _count: {
        comments: store.comments.filter(
          (c) => c.postId === p.id && c.status === "VISIBLE",
        ).length,
      },
    };
  }

  return { store, prismaMock, PrismaClientKnownRequestError };
});

vi.mock("@jumpflow/database", () => ({
  prisma: h.prismaMock,
  Prisma: {
    JsonNull: "__JsonNull__",
    PrismaClientKnownRequestError: h.PrismaClientKnownRequestError,
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth/guards", () => ({
  requireUser: vi.fn(async () => h.store.currentUser),
  // Mirrors the real guard: require the user then enforce the matrix grant.
  // On denial the real impl redirects (throws a NEXT_* error); here we throw a
  // FORBIDDEN ActionError-shaped object so getAttachmentUrl fails closed.
  requirePermission: vi.fn(
    async (_code: string, action: "view" | "create" | "edit" | "delete" = "view") => {
      if (h.store.can[action] !== true) {
        throw Object.assign(new Error("forbidden"), { digest: "NEXT_REDIRECT" });
      }
      return h.store.currentUser;
    },
  ),
}));

vi.mock("@/lib/auth/permissions", () => ({
  can: vi.fn(
    async (_code: string, action: "view" | "create" | "edit" | "delete") => {
      return h.store.can[action] === true;
    },
  ),
}));

vi.mock("@/lib/db/users", () => ({
  resolveDbUser: vi.fn(async () => ({
    id: h.store.dbUserId,
    name: "Ana",
    email: h.store.currentUser.email,
  })),
}));

vi.mock("@/lib/db/config", () => ({
  isDatabaseConfigured: () => true,
}));

vi.mock("@/lib/db/audit", () => ({
  recordAuditEvent: vi.fn(async (input: Record<string, unknown>) => {
    h.store.audits.push(input);
  }),
}));

// lib/db/feed: keep the REAL listFeed (it runs on the mocked prisma), but
// override isModeratorUser off the store toggle and stub the signed-url path
// so attachment-url tests do not depend on real storage.
vi.mock("@/lib/db/feed", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/feed")>("@/lib/db/feed");
  return {
    ...actual,
    isModeratorUser: () => h.store.moderator,
    getFeedAttachmentSignedUrl: vi.fn(async (id: string) => {
      if (!h.store.storageConfigured) {
        return { ok: false, error: "NO_STORAGE", message: "off" };
      }
      return { ok: true, data: { url: `https://signed/${id}` } };
    }),
  };
});

const uploaded: { key: string; deleted: boolean }[] = [];
vi.mock("@/lib/storage/provider", async () => {
  const actual = await vi.importActual<typeof import("@/lib/storage/provider")>(
    "@/lib/storage/provider",
  );
  return {
    ...actual,
    isStorageConfigured: () => h.store.storageConfigured,
    getFeedAttachmentStorageProvider: () =>
      h.store.storageConfigured
        ? {
            upload: vi.fn(async (key: string) => {
              uploaded.push({ key, deleted: false });
            }),
            delete: vi.fn(async (key: string) => {
              const u = uploaded.find((x) => x.key === key);
              if (u) u.deleted = true;
            }),
            getSignedUrl: vi.fn(async (key: string) => `https://signed/${key}`),
          }
        : null,
  };
});

import {
  addComment,
  attachToPost,
  createPost,
  deletePost,
  editPost,
  getAttachmentUrl,
  moderateRemove,
  removeAttachment,
  togglePin,
  toggleReaction,
} from "./actions";
import { listFeed } from "@/lib/db/feed";

function seedPost(over: Partial<PostRec> = {}): PostRec {
  const post: PostRec = {
    id: `seed-post-${++h.store.seq}`,
    authorUserId: "user-2",
    body: "Olá time",
    visibility: "PUBLIC_INTERNAL",
    status: "VISIBLE",
    pinned: false,
    removedByUserId: null,
    removedAt: null,
    removalReason: null,
    editedAt: null,
    createdAt: new Date(2026, 5, 1 + h.store.seq),
    ...over,
  };
  h.store.posts.push(post);
  return post;
}

import type { AppUser } from "@/lib/auth/types";

const appUser: AppUser = {
  id: "dev-user",
  name: "Ana",
  email: "ana@jumplabel.com.br",
  roles: ["CONSULTANT"],
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgresql://u:p@localhost:5432/db");
  h.store.posts = [];
  h.store.comments = [];
  h.store.reactions = [];
  h.store.attachments = [];
  h.store.audits = [];
  h.store.seq = 0;
  h.store.can = { view: true, create: true, edit: true, delete: false };
  h.store.moderator = false;
  h.store.storageConfigured = false;
  h.store.forceReactionConflict = false;
  h.store.currentUser = {
    id: "dev-user",
    email: "ana@jumplabel.com.br",
    roles: ["CONSULTANT"],
  };
  h.store.dbUserId = "user-1";
  uploaded.length = 0;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createPost / RBAC", () => {
  it("creates a PUBLIC_INTERNAL post for an authorized user", async () => {
    const r = await createPost({ body: "Primeiro post" });
    expect(r.ok).toBe(true);
    expect(h.store.posts).toHaveLength(1);
    expect(h.store.posts[0].visibility).toBe("PUBLIC_INTERNAL");
    expect(h.store.posts[0].authorUserId).toBe("user-1");
  });

  it("fails closed without FEED.create (FORBIDDEN)", async () => {
    h.store.can.create = false;
    const r = await createPost({ body: "Sem permissão" });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.posts).toHaveLength(0);
  });

  it("rejects an empty body (INVALID_INPUT)", async () => {
    const r = await createPost({ body: "   " });
    expect(r).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });
});

describe("edit / delete authorship", () => {
  it("the author edits their own post and marks editedAt", async () => {
    const post = seedPost({ authorUserId: "user-1" });
    const r = await editPost({ postId: post.id, body: "Editado" });
    expect(r.ok).toBe(true);
    expect(h.store.posts[0].body).toBe("Editado");
    expect(h.store.posts[0].editedAt).toBeInstanceOf(Date);
  });

  it("a non-author cannot edit (FORBIDDEN)", async () => {
    const post = seedPost({ authorUserId: "user-2" });
    const r = await editPost({ postId: post.id, body: "Hack" });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.posts[0].body).toBe("Olá time");
  });

  it("the author soft-deletes their own post (DELETED_BY_AUTHOR)", async () => {
    const post = seedPost({ authorUserId: "user-1" });
    const r = await deletePost({ postId: post.id });
    expect(r.ok).toBe(true);
    expect(h.store.posts[0].status).toBe("DELETED_BY_AUTHOR");
  });

  it("a non-author cannot delete (FORBIDDEN)", async () => {
    const post = seedPost({ authorUserId: "user-2" });
    const r = await deletePost({ postId: post.id });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.posts[0].status).toBe("VISIBLE");
  });
});

describe("addComment", () => {
  it("comments on a VISIBLE post", async () => {
    const post = seedPost();
    const r = await addComment({ postId: post.id, body: "Top!" });
    expect(r.ok).toBe(true);
    expect(h.store.comments).toHaveLength(1);
  });

  it("refuses to comment on a removed post (NOT_FOUND)", async () => {
    const post = seedPost({ status: "REMOVED_BY_MODERATION" });
    const r = await addComment({ postId: post.id, body: "x" });
    expect(r).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });
});

describe("toggleReaction (idempotent)", () => {
  it("first click adds, second click removes (no duplication)", async () => {
    const post = seedPost();
    const a = await toggleReaction({ postId: post.id, emoji: "👍" });
    expect(a).toMatchObject({ ok: true, data: { reacted: true } });
    expect(h.store.reactions).toHaveLength(1);

    const b = await toggleReaction({ postId: post.id, emoji: "👍" });
    expect(b).toMatchObject({ ok: true, data: { reacted: false } });
    expect(h.store.reactions).toHaveLength(0);
  });

  it("does not duplicate under a race (P2002 swallowed as reacted)", async () => {
    const post = seedPost();
    h.store.forceReactionConflict = true; // the concurrent insert won the index
    const r = await toggleReaction({ postId: post.id, emoji: "🎉" });
    expect(r).toMatchObject({ ok: true, data: { reacted: true } });
    // our create threw P2002; we did NOT add a second row
    expect(h.store.reactions).toHaveLength(0);
  });

  it("rejects reacting to a removed post", async () => {
    const post = seedPost({ status: "DELETED_BY_AUTHOR" });
    const r = await toggleReaction({ postId: post.id, emoji: "👍" });
    expect(r).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("rejects targeting both post and comment", async () => {
    const r = await toggleReaction({
      postId: "p",
      commentId: "c",
      emoji: "👍",
    });
    expect(r).toMatchObject({ ok: false, error: "INVALID_INPUT" });
  });
});

describe("moderation (RBAC)", () => {
  it("a moderator removes a post (REMOVED_BY_MODERATION + audit)", async () => {
    h.store.can.delete = true;
    h.store.moderator = true;
    const post = seedPost({ authorUserId: "user-2" });
    const r = await moderateRemove({ postId: post.id, reason: "spam" });
    expect(r.ok).toBe(true);
    expect(h.store.posts[0].status).toBe("REMOVED_BY_MODERATION");
    expect(h.store.posts[0].removedByUserId).toBe("user-1");
    expect(h.store.posts[0].removalReason).toBe("spam");
    expect(
      h.store.audits.some((a) => a.action === "FEED_CONTENT_MODERATED"),
    ).toBe(true);
  });

  it("a non-moderator cannot remove others' content (FORBIDDEN)", async () => {
    h.store.can.delete = false; // matrix denies delete
    h.store.moderator = false;
    const post = seedPost({ authorUserId: "user-2" });
    const r = await moderateRemove({ postId: post.id });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
    expect(h.store.posts[0].status).toBe("VISIBLE");
  });

  it("a moderation role WITHOUT matrix delete still cannot moderate", async () => {
    h.store.can.delete = false;
    h.store.moderator = true; // role yes, matrix no
    const post = seedPost();
    const r = await moderateRemove({ postId: post.id });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("removing already-removed content yields ALREADY_DECIDED", async () => {
    h.store.can.delete = true;
    h.store.moderator = true;
    const post = seedPost({ status: "REMOVED_BY_MODERATION" });
    const r = await moderateRemove({ postId: post.id });
    expect(r).toMatchObject({ ok: false, error: "ALREADY_DECIDED" });
  });
});

describe("togglePin (max 3)", () => {
  beforeEach(() => {
    h.store.can.delete = true;
    h.store.moderator = true;
  });

  it("pins a post and audits", async () => {
    const post = seedPost();
    const r = await togglePin({ postId: post.id, pinned: true });
    expect(r).toMatchObject({ ok: true, data: { pinned: true } });
    expect(h.store.posts[0].pinned).toBe(true);
    expect(h.store.audits.some((a) => a.action === "FEED_POST_PINNED")).toBe(true);
  });

  it("rejects a 4th pin (NOT_EDITABLE)", async () => {
    seedPost({ pinned: true });
    seedPost({ pinned: true });
    seedPost({ pinned: true });
    const fourth = seedPost();
    const r = await togglePin({ postId: fourth.id, pinned: true });
    expect(r).toMatchObject({ ok: false, error: "NOT_EDITABLE" });
    expect(h.store.posts.find((p) => p.id === fourth.id)!.pinned).toBe(false);
  });

  it("a non-moderator cannot pin (FORBIDDEN)", async () => {
    h.store.can.delete = false;
    h.store.moderator = false;
    const post = seedPost();
    const r = await togglePin({ postId: post.id, pinned: true });
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });
});

describe("attachments", () => {
  function formDataWith(postId: string, file: File): FormData {
    const fd = new FormData();
    fd.set("postId", postId);
    fd.set("file", file);
    return fd;
  }

  it("degrades honestly when storage is off (NO_STORAGE)", async () => {
    h.store.storageConfigured = false;
    const post = seedPost({ authorUserId: "user-1" });
    const file = new File([new Uint8Array([1, 2, 3])], "foto.png", {
      type: "image/png",
    });
    const r = await attachToPost(formDataWith(post.id, file));
    expect(r).toMatchObject({ ok: false, error: "NO_STORAGE" });
  });

  it("writes the attachment and uploads to the bucket", async () => {
    h.store.storageConfigured = true;
    const post = seedPost({ authorUserId: "user-1" });
    const file = new File([new Uint8Array([1, 2, 3])], "foto.png", {
      type: "image/png",
    });
    const r = await attachToPost(formDataWith(post.id, file));
    expect(r.ok).toBe(true);
    expect(h.store.attachments).toHaveLength(1);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0].deleted).toBe(false);
  });

  it("validates the file before touching storage (INVALID_FILE)", async () => {
    h.store.storageConfigured = true;
    const post = seedPost({ authorUserId: "user-1" });
    const bad = new File([new Uint8Array([1])], "x.svg", {
      type: "image/svg+xml",
    });
    const r = await attachToPost(formDataWith(post.id, bad));
    expect(r).toMatchObject({ ok: false, error: "INVALID_FILE" });
    expect(uploaded).toHaveLength(0);
  });

  it("a non-author cannot attach (FORBIDDEN)", async () => {
    h.store.storageConfigured = true;
    const post = seedPost({ authorUserId: "user-2" });
    const file = new File([new Uint8Array([1])], "foto.png", { type: "image/png" });
    const r = await attachToPost(formDataWith(post.id, file));
    expect(r).toMatchObject({ ok: false, error: "FORBIDDEN" });
  });

  it("reads a signed URL on demand", async () => {
    h.store.storageConfigured = true;
    const post = seedPost({ authorUserId: "user-1" });
    h.store.attachments.push({
      id: "att-x",
      postId: post.id,
      fileName: "f.png",
      contentType: "image/png",
      size: 10,
      storageBucket: "feed-attachments",
      storageKey: "feed/p/x.png",
      uploadedByUserId: "user-1",
    });
    const r = await getAttachmentUrl({ attachmentId: "att-x" });
    expect(r).toMatchObject({ ok: true, data: { url: "https://signed/att-x" } });
  });

  it("the owner removes their attachment + cleans storage", async () => {
    h.store.storageConfigured = true;
    const post = seedPost({ authorUserId: "user-1" });
    h.store.attachments.push({
      id: "att-y",
      postId: post.id,
      fileName: "f.png",
      contentType: "image/png",
      size: 10,
      storageBucket: "feed-attachments",
      storageKey: "feed/p/y.png",
      uploadedByUserId: "user-1",
    });
    uploaded.push({ key: "feed/p/y.png", deleted: false });
    const r = await removeAttachment({ attachmentId: "att-y" });
    expect(r.ok).toBe(true);
    expect(h.store.attachments.find((a) => a.id === "att-y")).toBeUndefined();
    expect(uploaded.find((u) => u.key === "feed/p/y.png")!.deleted).toBe(true);
  });
});

describe("listFeed (pagination + visibility/authorship cropping)", () => {
  it("paginates by cursor in (pinned desc, createdAt desc, id desc)", async () => {
    // 3 posts; page size 2 -> first page 2 + nextCursor, second page the rest.
    seedPost({ id: "post-a", createdAt: new Date("2026-06-01T00:00:00Z") });
    seedPost({ id: "post-b", createdAt: new Date("2026-06-02T00:00:00Z") });
    seedPost({ id: "post-c", createdAt: new Date("2026-06-03T00:00:00Z"), pinned: true });

    const page1 = await listFeed(appUser, { pageSize: 2 });
    // pinned first (post-c), then newest unpinned (post-b)
    expect(page1.posts.map((p) => p.id)).toEqual(["post-c", "post-b"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listFeed(appUser, {
      pageSize: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.posts.map((p) => p.id)).toEqual(["post-a"]);
    expect(page2.nextCursor).toBeNull();
  });

  it("a removed post shows as a TOMBSTONE to a non-author (no body)", async () => {
    seedPost({
      id: "post-rm",
      authorUserId: "user-2",
      body: "segredo",
      status: "REMOVED_BY_MODERATION",
    });
    const page = await listFeed(appUser); // viewer is user-1, not the author
    const post = page.posts.find((p) => p.id === "post-rm")!;
    expect(post.body).toBeNull();
    expect(post.tombstone).toMatch(/modera/i);
    expect(post.isOwn).toBe(false);
  });

  it("aggregates reactions with the viewer flag", async () => {
    const post = seedPost({ id: "post-react" });
    h.store.reactions.push(
      { id: "r1", emoji: "👍", userId: "user-1", postId: post.id, commentId: null },
      { id: "r2", emoji: "👍", userId: "user-9", postId: post.id, commentId: null },
    );
    const page = await listFeed(appUser); // viewer db id = user-1
    const view = page.posts.find((p) => p.id === "post-react")!;
    expect(view.reactions).toEqual([{ emoji: "👍", count: 2, reacted: true }]);
  });

  it("loads up to 3 recent comments + the full visible count", async () => {
    const post = seedPost({ id: "post-comments" });
    for (let i = 0; i < 5; i++) {
      h.store.comments.push({
        id: `c${i}`,
        postId: post.id,
        authorUserId: "user-2",
        body: `c${i}`,
        status: "VISIBLE",
        editedAt: null,
        createdAt: new Date(2026, 5, 10, 0, i),
      });
    }
    const page = await listFeed(appUser);
    const view = page.posts.find((p) => p.id === "post-comments")!;
    expect(view.comments).toHaveLength(3);
    expect(view.commentCount).toBe(5);
  });
});
