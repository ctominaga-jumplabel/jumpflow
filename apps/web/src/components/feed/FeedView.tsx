"use client";

import { useState, useTransition } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import type { FeedCapabilities } from "@/lib/feed/visibility";
import type { FeedPostView } from "@/lib/feed/types";
import { loadFeedPage } from "@/app/app/feed/actions";
import { FeedComposer } from "./FeedComposer";
import { FeedPostCard } from "./FeedPostCard";

export interface FeedViewProps {
  initialPosts: FeedPostView[];
  initialCursor: string | null;
  capabilities: FeedCapabilities;
  storageEnabled: boolean;
  authorName: string;
}

/**
 * Orchestrator for the Feed. The first page is server-rendered (props); the
 * composer publishes (the action revalidates the path, refreshing page 1), and
 * "carregar mais" appends further keyset pages via the `loadFeedPage` action
 * into client state.
 *
 * Empty/loading/error states are explicit. Mutations notify through a polite
 * live region (FeedbackBanner) rather than faking a result.
 */
export function FeedView({
  initialPosts,
  initialCursor,
  capabilities,
  storageEnabled,
  authorName,
}: FeedViewProps) {
  const { feedback, notify } = useFeedback();
  // Pages appended after the first (server-rendered) page.
  const [extraPosts, setExtraPosts] = useState<FeedPostView[]>([]);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, startLoading] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);

  // When the server tree refreshes (revalidatePath after a mutation), the
  // initial page changes — drop the appended tail and reset the cursor so we do
  // not show stale/duplicated pages. This is the React "adjust state during
  // render when a prop changes" idiom (keyed by the server identity), which
  // avoids a setState-in-effect cascade.
  const [serverKey, setServerKey] = useState(initialCursor);
  if (serverKey !== initialCursor) {
    setServerKey(initialCursor);
    setExtraPosts([]);
    setCursor(initialCursor);
  }

  function loadMore() {
    if (loading || cursor === null) return;
    setLoadError(null);
    startLoading(async () => {
      const result = await loadFeedPage(cursor);
      if (result.ok) {
        setExtraPosts((prev) => [...prev, ...result.data.posts]);
        setCursor(result.data.nextCursor);
      } else {
        setLoadError(result.message);
      }
    });
  }

  const posts = [...initialPosts, ...extraPosts];

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <FeedComposer
        canPost={capabilities.canPost}
        storageEnabled={storageEnabled}
        authorName={authorName}
        notify={notify}
      />

      <FeedbackBanner message={feedback} />

      {posts.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="Nenhum post ainda"
          description={
            capabilities.canPost
              ? "Seja o primeiro a compartilhar uma novidade com o time."
              : "Quando o time publicar, as novidades aparecem aqui."
          }
        />
      ) : (
        <div className="space-y-4">
          {posts.map((post, index) => (
            <FeedPostCard
              key={post.id}
              post={post}
              capabilities={capabilities}
              notify={notify}
              isNew={index >= initialPosts.length}
            />
          ))}
        </div>
      )}

      {loadError ? (
        <p
          role="alert"
          className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger"
        >
          {loadError}
        </p>
      ) : null}

      {cursor !== null ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border-2 border-ink bg-surface px-4 py-2 text-sm font-semibold text-strong shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] hover:-translate-y-px disabled:opacity-60",
              focusRing,
            )}
          >
            {loading ? (
              <>
                <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                Carregando…
              </>
            ) : (
              "Carregar mais"
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
