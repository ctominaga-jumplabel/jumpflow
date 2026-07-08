import type { ReactNode } from "react";
import type { FeedMentionMeta } from "@/lib/feed/types";

/**
 * Renders a post/comment body as plain text, highlighting the `@name` tokens
 * that correspond to CONFIRMED mentions (the server-persisted list). We never
 * use `dangerouslySetInnerHTML`: the text is split into React string nodes and
 * styled `<span>`s, so there is no injection surface.
 *
 * Only names present in `mentions` are highlighted — typing "@joão" without
 * picking from the autocomplete does NOT highlight (and did not notify anyone).
 * Matching requires a word boundary on both sides so "@Ana" does not light up
 * inside "@Anabela" or an "email@Ana" address.
 */
export function MentionText({
  text,
  mentions,
  className,
}: {
  text: string;
  mentions: FeedMentionMeta[];
  className?: string;
}) {
  const content = renderMentions(text, mentions);
  return (
    <p
      className={
        className ??
        "mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-strong"
      }
    >
      {content}
    </p>
  );
}

const WORD_CHAR = /[\p{L}\p{N}_]/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Given the composed body and the users picked from the autocomplete, return the
 * ids whose `@name` token is STILL present in the body (a user may have deleted
 * the text after picking). Deduplicated. Sent to the server on submit; the
 * server revalidates each id independently.
 */
export function collectActiveMentionIds(
  body: string,
  picked: ReadonlyArray<{ id: string; name: string }>,
): string[] {
  const ids = new Set<string>();
  for (const user of picked) {
    if (!user.name) continue;
    const re = new RegExp(
      `(?:^|[^\\p{L}\\p{N}_])@${escapeRegExp(user.name)}(?![\\p{L}\\p{N}_])`,
      "u",
    );
    if (re.test(body)) ids.add(user.id);
  }
  return [...ids];
}

/** Split `text` into plain strings + highlighted mention spans. Pure/testable. */
export function renderMentions(
  text: string,
  mentions: FeedMentionMeta[],
): ReactNode[] {
  if (!text) return [];
  const names = [...new Set(mentions.map((m) => m.name).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (names.length === 0) return [text];

  // Longest-first alternation so "@Ana Paula" wins over "@Ana"; trailing
  // lookahead enforces the right-side word boundary.
  const pattern = new RegExp(
    `@(?:${names.map(escapeRegExp).join("|")})(?![\\p{L}\\p{N}_])`,
    "gu",
  );

  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const start = match.index;
    // Left-side word boundary: skip "@name" glued to a preceding word char
    // (e.g. an email). The skipped run stays plain — `last` is not advanced.
    const prev = start > 0 ? text[start - 1] : "";
    if (prev && WORD_CHAR.test(prev)) continue;

    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <span
        key={`m-${key++}`}
        className="font-semibold text-brand"
        data-mention
      >
        {match[0]}
      </span>,
    );
    last = start + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
