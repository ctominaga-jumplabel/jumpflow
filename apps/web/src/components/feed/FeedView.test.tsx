import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FeedView } from "./FeedView";
import type { FeedPostView } from "@/lib/feed/types";
import type { FeedCapabilities } from "@/lib/feed/visibility";

/**
 * Feed UI tests. The server actions are mocked so the suite is hermetic (no DB,
 * no Prisma). GOTCHA: motion's AnimatePresence keeps exiting nodes mounted in
 * jsdom — scope post-action assertions to a result region (the post element)
 * rather than the whole document where helpful.
 */

const toggleReaction = vi.fn();
const createPost = vi.fn();
const loadFeedPage = vi.fn();
const getAttachmentUrl = vi.fn();

vi.mock("@/app/app/feed/actions", () => ({
  toggleReaction: (...args: unknown[]) => toggleReaction(...args),
  createPost: (...args: unknown[]) => createPost(...args),
  loadFeedPage: (...args: unknown[]) => loadFeedPage(...args),
  attachToPost: vi.fn(),
  editPost: vi.fn(),
  deletePost: vi.fn(),
  addComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
  moderateRemove: vi.fn(),
  togglePin: vi.fn(),
  getAttachmentUrl: (...args: unknown[]) => getAttachmentUrl(...args),
}));

const caps = {
  reader: { canPost: false, canModerate: false, canPin: false },
  member: { canPost: true, canModerate: false, canPin: false },
  moderator: { canPost: true, canModerate: true, canPin: true },
} satisfies Record<string, FeedCapabilities>;

function comment(over: Partial<FeedPostView["comments"][number]> = {}) {
  return {
    id: "c1",
    author: { id: "u2", name: "Bia Souza" },
    body: "Parabéns ao time!",
    status: "VISIBLE" as const,
    editedAt: null,
    createdAt: new Date().toISOString(),
    reactions: [],
    isOwn: false,
    ...over,
  };
}

function post(over: Partial<FeedPostView> = {}): FeedPostView {
  return {
    id: "p1",
    author: { id: "u1", name: "Ana Lima" },
    body: "Fechamos o trimestre acima da meta.",
    status: "VISIBLE",
    visibility: "PUBLIC_INTERNAL",
    pinned: false,
    editedAt: null,
    createdAt: new Date().toISOString(),
    reactions: [{ emoji: "👍", count: 2, reacted: false }],
    attachments: [],
    comments: [comment()],
    commentCount: 1,
    isOwn: false,
    ...over,
  };
}

function renderFeed(
  posts: FeedPostView[],
  capabilities: FeedCapabilities = caps.member,
  cursor: string | null = null,
) {
  return render(
    <FeedView
      initialPosts={posts}
      initialCursor={cursor}
      capabilities={capabilities}
      storageEnabled={false}
      authorName="Ana Lima"
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FeedView render", () => {
  it("renders posts with body, comments and reaction chips", () => {
    renderFeed([post()]);
    expect(
      screen.getByText("Fechamos o trimestre acima da meta."),
    ).toBeInTheDocument();
    expect(screen.getByText("Ana Lima")).toBeInTheDocument();
    expect(screen.getByText("Parabéns ao time!")).toBeInTheDocument();
    // Reaction chip shows its count.
    expect(
      screen.getByRole("button", { name: /Curtir \(2\)/ }),
    ).toBeInTheDocument();
  });

  it("renders the empty state when there are no posts", () => {
    renderFeed([]);
    expect(screen.getByText("Nenhum post ainda")).toBeInTheDocument();
  });
});

describe("FeedComposer limit + read-only", () => {
  it("shows the read-only notice and no publish control when !canPost", () => {
    renderFeed([post()], caps.reader);
    expect(screen.getByText(/modo leitura/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Publicar/ }),
    ).not.toBeInTheDocument();
  });

  it("keeps Publicar disabled until there is non-empty body", () => {
    renderFeed([], caps.member);
    const publish = screen.getByRole("button", { name: /Publicar/ });
    expect(publish).toBeDisabled();

    const textarea = screen.getByLabelText("Escreva um post");
    fireEvent.change(textarea, { target: { value: "Bom dia, time!" } });
    expect(publish).toBeEnabled();
  });

  it("decrements the character counter as the body grows", () => {
    renderFeed([], caps.member);
    const textarea = screen.getByLabelText("Escreva um post");
    fireEvent.change(textarea, { target: { value: "12345" } });
    // 2000 soft limit - 5 chars.
    expect(screen.getByText("1995")).toBeInTheDocument();
  });
});

describe("ReactionBar optimistic toggle", () => {
  it("flips the chip count immediately and calls the action", async () => {
    toggleReaction.mockResolvedValue({ ok: true, data: { reacted: true } });
    renderFeed([post()]);

    const article = screen.getByTestId("feed-post");
    const chip = within(article).getByRole("button", { name: /Curtir \(2\)/ });
    fireEvent.click(chip);

    // Optimistic: count goes to 3 right away.
    await waitFor(() =>
      expect(
        within(article).getByRole("button", { name: /Curtir \(3\)/ }),
      ).toBeInTheDocument(),
    );
    expect(toggleReaction).toHaveBeenCalledWith({ emoji: "👍", postId: "p1" });
  });

  it("reverts the optimistic change when the action fails", async () => {
    toggleReaction.mockResolvedValue({
      ok: false,
      error: "FORBIDDEN",
      message: "Sem permissão.",
    });
    renderFeed([post()]);

    const article = screen.getByTestId("feed-post");
    fireEvent.click(
      within(article).getByRole("button", { name: /Curtir \(2\)/ }),
    );

    // After the failed reconcile, the chip returns to 2.
    await waitFor(() =>
      expect(
        within(article).getByRole("button", { name: /Curtir \(2\)/ }),
      ).toBeInTheDocument(),
    );
  });
});

describe("Tombstone", () => {
  it("renders the tombstone label for a removed post without its body", () => {
    renderFeed([
      post({
        body: null,
        status: "REMOVED_BY_MODERATION",
        tombstone: "Conteúdo removido pela moderação.",
        attachments: [],
        comments: [],
        reactions: [],
      }),
    ]);
    expect(
      screen.getByText("Conteúdo removido pela moderação."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Fechamos o trimestre acima da meta."),
    ).not.toBeInTheDocument();
  });
});

describe("Moderation affordances", () => {
  it("does NOT show the post action menu to a plain member on others' posts", () => {
    renderFeed([post({ isOwn: false })], caps.member);
    expect(
      screen.queryByRole("button", { name: "Ações do post" }),
    ).not.toBeInTheDocument();
  });

  it("shows moderation/pin actions to a moderator on others' posts", async () => {
    renderFeed([post({ isOwn: false })], caps.moderator);
    const menuButton = screen.getByRole("button", { name: "Ações do post" });
    fireEvent.click(menuButton);

    await waitFor(() =>
      expect(
        screen.getByRole("menuitem", { name: /Remover \(moderação\)/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("menuitem", { name: "Fixar" })).toBeInTheDocument();
  });
});
