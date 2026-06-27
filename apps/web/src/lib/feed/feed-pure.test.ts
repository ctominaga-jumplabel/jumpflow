import { describe, expect, it } from "vitest";
import {
  decodeFeedCursor,
  encodeFeedCursor,
  feedSeekWhere,
  type FeedCursor,
} from "./cursor";
import { aggregateReactions, tombstoneLabel } from "./types";
import {
  canSeeContentBody,
  isFeedModerator,
  resolveFeedCapabilities,
  viewableVisibilities,
  FEED_MAX_PINNED,
} from "./visibility";
import {
  validateFeedAttachmentFile,
  MAX_FEED_ATTACHMENT_SIZE_BYTES,
} from "@/lib/storage/file-validation";
import { buildFeedAttachmentKey } from "@/lib/storage/file-validation";

describe("feed cursor (keyset pagination)", () => {
  const cursor: FeedCursor = {
    pinned: false,
    createdAt: new Date("2026-06-20T10:00:00.000Z"),
    id: "post-123",
  };

  it("round-trips through encode/decode", () => {
    const decoded = decodeFeedCursor(encodeFeedCursor(cursor));
    expect(decoded).not.toBeNull();
    expect(decoded!.pinned).toBe(false);
    expect(decoded!.id).toBe("post-123");
    expect(decoded!.createdAt.toISOString()).toBe(cursor.createdAt.toISOString());
  });

  it("preserves the pinned flag", () => {
    const decoded = decodeFeedCursor(
      encodeFeedCursor({ ...cursor, pinned: true }),
    );
    expect(decoded!.pinned).toBe(true);
  });

  it("returns null for empty/garbage cursors (fail-soft)", () => {
    expect(decodeFeedCursor(null)).toBeNull();
    expect(decodeFeedCursor(undefined)).toBeNull();
    expect(decodeFeedCursor("")).toBeNull();
    expect(decodeFeedCursor("not-base64-$$$")).toBeNull();
    // valid base64url but wrong shape
    expect(decodeFeedCursor(Buffer.from("{}", "utf8").toString("base64url"))).toBeNull();
  });

  it("builds an unpinned-cursor seek that stays in the same (createdAt,id) order", () => {
    const where = feedSeekWhere(cursor) as { OR: Record<string, unknown>[] };
    // unpinned cursor: NO "pinned: false" jump row (it is already the last bucket)
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0]).toEqual({
      pinned: false,
      createdAt: { lt: cursor.createdAt },
    });
    expect(where.OR[1]).toEqual({
      pinned: false,
      createdAt: cursor.createdAt,
      id: { lt: "post-123" },
    });
  });

  it("a pinned cursor also crosses into the unpinned section", () => {
    const where = feedSeekWhere({ ...cursor, pinned: true }) as {
      OR: Record<string, unknown>[];
    };
    // pinned cursor: extra "pinned: false" branch so the next page can be the
    // start of the unpinned timeline.
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toEqual({ pinned: false });
  });
});

describe("aggregateReactions", () => {
  const rows = [
    { emoji: "👍", userId: "u1" },
    { emoji: "👍", userId: "u2" },
    { emoji: "🎉", userId: "u1" },
    { emoji: "👍", userId: "viewer" },
  ];

  it("counts per emoji, descending, with viewer flag", () => {
    const result = aggregateReactions(rows, "viewer");
    expect(result).toEqual([
      { emoji: "👍", count: 3, reacted: true },
      { emoji: "🎉", count: 1, reacted: false },
    ]);
  });

  it("a null viewer never marks reacted", () => {
    const result = aggregateReactions(rows, null);
    expect(result.every((r) => r.reacted === false)).toBe(true);
  });

  it("returns [] for no reactions", () => {
    expect(aggregateReactions([], "viewer")).toEqual([]);
  });
});

describe("feed visibility + capabilities", () => {
  it("only PUBLIC_INTERNAL is viewable in v1 (AREA hook off)", () => {
    expect(viewableVisibilities()).toEqual(["PUBLIC_INTERNAL"]);
  });

  it("the body is exposed only for VISIBLE content", () => {
    expect(canSeeContentBody("VISIBLE")).toBe(true);
    expect(canSeeContentBody("DELETED_BY_AUTHOR")).toBe(false);
    expect(canSeeContentBody("REMOVED_BY_MODERATION")).toBe(false);
  });

  it("tombstone labels distinguish author vs moderation removal", () => {
    expect(tombstoneLabel("DELETED_BY_AUTHOR")).toMatch(/autor/i);
    expect(tombstoneLabel("REMOVED_BY_MODERATION")).toMatch(/modera/i);
  });

  it("moderation requires ADMIN or PEOPLE", () => {
    expect(isFeedModerator(["ADMIN"])).toBe(true);
    expect(isFeedModerator(["PEOPLE"])).toBe(true);
    expect(isFeedModerator(["CONSULTANT"])).toBe(false);
    expect(isFeedModerator(["AREA_MANAGER", "FINANCE"])).toBe(false);
  });

  it("canModerate/canPin require BOTH the role AND the matrix delete grant", () => {
    // moderator role but matrix revoked delete -> no moderation
    expect(
      resolveFeedCapabilities({
        roles: ["ADMIN"],
        canCreate: true,
        canDelete: false,
      }),
    ).toEqual({ canPost: true, canModerate: false, canPin: false });

    // matrix delete but no moderator role -> no moderation
    expect(
      resolveFeedCapabilities({
        roles: ["CONSULTANT"],
        canCreate: true,
        canDelete: true,
      }),
    ).toEqual({ canPost: true, canModerate: false, canPin: false });

    // both -> full moderation
    expect(
      resolveFeedCapabilities({
        roles: ["PEOPLE"],
        canCreate: true,
        canDelete: true,
      }),
    ).toEqual({ canPost: true, canModerate: true, canPin: true });
  });

  it("canPost mirrors the matrix create grant", () => {
    expect(
      resolveFeedCapabilities({ roles: ["CONSULTANT"], canCreate: false, canDelete: false })
        .canPost,
    ).toBe(false);
  });

  it("pin limit is 3", () => {
    expect(FEED_MAX_PINNED).toBe(3);
  });
});

describe("feed attachment validation", () => {
  it("accepts images and PDFs", () => {
    expect(
      validateFeedAttachmentFile({ name: "foto.png", type: "image/png", size: 1024 }),
    ).toBeNull();
    expect(
      validateFeedAttachmentFile({ name: "doc.pdf", type: "application/pdf", size: 1024 }),
    ).toBeNull();
  });

  it("rejects SVG (script vector) and unknown types", () => {
    expect(
      validateFeedAttachmentFile({ name: "x.svg", type: "image/svg+xml", size: 10 })?.code,
    ).toBe("INVALID_FILE");
    expect(
      validateFeedAttachmentFile({ name: "x.exe", type: "application/x-msdownload", size: 10 })
        ?.code,
    ).toBe("INVALID_FILE");
  });

  it("rejects an extension/MIME mismatch", () => {
    expect(
      validateFeedAttachmentFile({ name: "foto.pdf", type: "image/png", size: 10 })?.code,
    ).toBe("INVALID_FILE");
  });

  it("rejects empty and oversized files", () => {
    expect(
      validateFeedAttachmentFile({ name: "x.png", type: "image/png", size: 0 })?.code,
    ).toBe("FILE_TOO_LARGE");
    expect(
      validateFeedAttachmentFile({
        name: "x.png",
        type: "image/png",
        size: MAX_FEED_ATTACHMENT_SIZE_BYTES + 1,
      })?.code,
    ).toBe("FILE_TOO_LARGE");
  });

  it("builds a sensitive-data-free storage key", () => {
    const key = buildFeedAttachmentKey(
      "post-1",
      "Relatório Final.PNG",
      new Date("2026-06-20T10:11:12.000Z"),
    );
    expect(key).toBe("feed/post-1/2026-06-20T101112Z-relatorio-final.png");
  });
});
