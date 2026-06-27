"use client";

import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { SmilePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type { FeedReactionSummary } from "@/lib/feed/types";
import { reactionLabel } from "@/lib/feed/types";
import { toggleReaction } from "@/app/app/feed/actions";
import type { FeedbackTone } from "@/components/ui/Feedback";
import { EmojiPicker } from "./EmojiPicker";

export interface ReactionBarProps {
  /** Exactly one of postId/commentId identifies the target. */
  postId?: string;
  commentId?: string;
  reactions: FeedReactionSummary[];
  /** Viewer may react (FEED.create). When false, chips are read-only. */
  canReact: boolean;
  notify: (tone: FeedbackTone, text: string) => void;
}

/**
 * Reaction chips with an optimistic toggle. A click flips the local state
 * immediately (and animates a short pop) while the server action reconciles;
 * on failure the optimistic change is reverted and an error is announced.
 *
 * The picker adds new emojis; clicking an existing chip toggles it.
 */
export function ReactionBar({
  postId,
  commentId,
  reactions,
  canReact,
  notify,
}: ReactionBarProps) {
  const reduce = useReducedMotion();
  const [pending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Optimistic overlay keyed by emoji. Absent = use the server value.
  const [optimistic, setOptimistic] = useState<
    Map<string, { reacted: boolean; count: number }>
  >(new Map());

  const chips = useMemo(() => {
    const map = new Map<string, { count: number; reacted: boolean }>();
    for (const r of reactions) map.set(r.emoji, { count: r.count, reacted: r.reacted });
    for (const [emoji, ov] of optimistic) {
      map.set(emoji, { count: ov.count, reacted: ov.reacted });
    }
    return [...map.entries()]
      .filter(([, v]) => v.count > 0)
      .map(([emoji, v]) => ({ emoji, ...v }))
      .sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
  }, [reactions, optimistic]);

  const activeEmojis = useMemo(
    () => new Set(chips.filter((c) => c.reacted).map((c) => c.emoji)),
    [chips],
  );

  function currentFor(emoji: string): { reacted: boolean; count: number } {
    const ov = optimistic.get(emoji);
    if (ov) return ov;
    const server = reactions.find((r) => r.emoji === emoji);
    return { reacted: server?.reacted ?? false, count: server?.count ?? 0 };
  }

  function handleToggle(emoji: string) {
    if (!canReact || pending) return;
    setPickerOpen(false);

    const current = currentFor(emoji);
    const next = {
      reacted: !current.reacted,
      count: current.reacted ? Math.max(0, current.count - 1) : current.count + 1,
    };
    setOptimistic((prev) => new Map(prev).set(emoji, next));

    startTransition(async () => {
      const result = await toggleReaction(
        postId ? { emoji, postId } : { emoji, commentId },
      );
      if (!result.ok) {
        // Revert this emoji's optimistic state.
        setOptimistic((prev) => {
          const copy = new Map(prev);
          copy.delete(emoji);
          return copy;
        });
        notify("warning", result.message);
      }
      // On success the revalidatePath re-renders the server tree with fresh
      // reactions; the optimistic overlay then matches and is harmless. We keep
      // it so the chip does not flicker before the refresh lands.
    });
  }

  // A multi-keyframe pop ([1, 1.18, 1]) must use a tween — springs only support
  // two keyframes. Keep it short so it never delays the click feedback.
  const popTransition = reduce
    ? { duration: 0 }
    : { duration: 0.22, ease: "easeOut" as const };

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <motion.button
          key={chip.emoji}
          type="button"
          disabled={!canReact || pending}
          onClick={() => handleToggle(chip.emoji)}
          aria-pressed={chip.reacted}
          aria-label={`${reactionLabel(chip.emoji)} (${chip.count})${
            chip.reacted ? " — você reagiu" : ""
          }`}
          initial={false}
          animate={reduce ? undefined : { scale: chip.reacted ? [1, 1.18, 1] : 1 }}
          transition={popTransition}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed",
            chip.reacted
              ? "border-brand bg-brand-soft text-brand-dark"
              : "border-border bg-surface text-medium hover:border-ink/40",
            canReact && !pending ? "" : "opacity-90",
            focusRing,
          )}
        >
          <span aria-hidden="true" className="text-sm leading-none">
            {chip.emoji}
          </span>
          {chip.count}
        </motion.button>
      ))}

      {canReact ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            disabled={pending}
            aria-label="Adicionar reação"
            aria-expanded={pickerOpen}
            aria-haspopup="menu"
            className={cn(
              "grid size-7 place-items-center rounded-full border border-dashed border-border text-medium transition-colors hover:border-ink/40 hover:text-strong disabled:cursor-not-allowed",
              focusRing,
            )}
          >
            <SmilePlus aria-hidden="true" className="size-4" />
          </button>
          <AnimatePresence>
            {pickerOpen ? (
              <EmojiPicker
                activeEmojis={activeEmojis}
                onPick={handleToggle}
                onClose={() => setPickerOpen(false)}
              />
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
