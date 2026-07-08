"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { cn } from "@/lib/utils";
import { focusRingInput } from "@/lib/styles";
import { searchFeedMentionUsers } from "@/app/app/feed/actions";
import { Avatar } from "./FeedCommentThread";

export interface MentionUser {
  id: string;
  name: string;
}

export interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the user picks someone from the dropdown. */
  onAddMention: (user: MentionUser) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
  id?: string;
  ariaLabel?: string;
  /** Forwarded key handler for submit shortcuts — only fires when the mention
   *  dropdown did NOT consume the event (so Enter selects a suggestion first). */
  onKeyDown?: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => void;
}

/** The token being typed right before the caret, e.g. "@ma". */
interface ActiveQuery {
  /** Index of the "@" in the value. */
  at: number;
  /** Text after "@" up to the caret. */
  query: string;
}

const MENTION_TOKEN = /(^|\s)@([\p{L}\p{N}._-]{0,40})$/u;

/**
 * Detect a mention token immediately before the caret: an "@" at line/word start
 * followed by up to 40 name chars, with nothing but those chars up to the caret.
 * Returns null when the caret is not inside a mention token.
 */
function detectActiveQuery(value: string, caret: number): ActiveQuery | null {
  const upToCaret = value.slice(0, caret);
  const match = MENTION_TOKEN.exec(upToCaret);
  if (!match) return null;
  const query = match[2];
  const at = caret - query.length - 1; // position of "@"
  return { at, query };
}

/**
 * A textarea with `@mention` autocomplete. Controlled `value`/`onChange` like a
 * plain textarea, plus `onAddMention` firing when a suggestion is picked. The
 * parent owns the picked-users list (for submit + edit rehydration); this
 * component only inserts `@Name ` into the text and reports the pick.
 */
export function MentionTextarea({
  value,
  onChange,
  onAddMention,
  disabled,
  placeholder,
  rows = 3,
  maxLength,
  className,
  id,
  ariaLabel,
  onKeyDown,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listboxId = useId();
  const [active, setActive] = useState<ActiveQuery | null>(null);
  const [results, setResults] = useState<MentionUser[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const open = active !== null;

  // Caret to restore AFTER a controlled re-render (insertion moves the caret).
  const pendingCaret = useRef<number | null>(null);
  // Monotonic token so a slow search response cannot overwrite a newer one.
  const searchToken = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (pendingCaret.current == null) return;
    const el = textareaRef.current;
    if (el) {
      const pos = pendingCaret.current;
      el.setSelectionRange(pos, pos);
      el.focus();
    }
    pendingCaret.current = null;
  }, [value]);

  // Debounced search whenever the active query changes. All setState happens
  // inside the timeout callback (async), never synchronously in the effect body
  // — that would trip react-hooks/set-state-in-effect and cascade renders.
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    const q = active?.query.trim() ?? "";
    const token = ++searchToken.current;
    debounceTimer.current = setTimeout(
      async () => {
        if (token !== searchToken.current) return;
        if (active === null || q.length === 0) {
          setResults([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        const res = await searchFeedMentionUsers(q);
        if (token !== searchToken.current) return; // a newer query superseded this
        setLoading(false);
        setResults(res.ok ? res.data.users : []);
        setHighlight(0);
      },
      active && q.length > 0 ? 150 : 0,
    );
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [active]);

  function syncActiveFromCaret(nextValue: string) {
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : nextValue.length;
    setActive(detectActiveQuery(nextValue, caret));
  }

  function handleChange(nextValue: string) {
    onChange(nextValue);
    syncActiveFromCaret(nextValue);
  }

  function closeDropdown() {
    setActive(null);
    setResults([]);
    setLoading(false);
  }

  function pick(user: MentionUser) {
    if (!active) return;
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : value.length;
    const before = value.slice(0, active.at);
    const after = value.slice(caret);
    const insert = `@${user.name} `;
    const nextValue = before + insert + after;
    pendingCaret.current = before.length + insert.length;
    onChange(nextValue);
    onAddMention(user);
    closeDropdown();
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (open && results.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % results.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + results.length) % results.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pick(results[highlight]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeDropdown();
        return;
      }
    } else if (open && e.key === "Escape") {
      e.preventDefault();
      closeDropdown();
      return;
    }
    // Not consumed by the dropdown → let the host handle submit shortcuts.
    onKeyDown?.(e);
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-label={ariaLabel}
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onClick={() => syncActiveFromCaret(value)}
        onBlur={() => {
          // Delay so an option's onMouseDown can run before we close.
          window.setTimeout(closeDropdown, 120);
        }}
        className={cn(
          "w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm leading-6 text-strong",
          focusRingInput,
          className,
        )}
      />

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          className="absolute left-0 top-full z-30 mt-1 max-h-64 w-full max-w-xs overflow-auto rounded-md border-2 border-ink bg-surface py-1 shadow-[3px_3px_0_0_var(--color-ink)]"
        >
          {loading ? (
            <p className="px-3 py-2 text-xs text-soft">Buscando…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-soft">
              {active && active.query.trim().length === 0
                ? "Digite para buscar uma pessoa…"
                : "Nenhuma pessoa encontrada."}
            </p>
          ) : (
            results.map((user, index) => (
              <button
                key={user.id}
                type="button"
                role="option"
                aria-selected={index === highlight}
                // onMouseDown (not onClick) so the pick runs before textarea blur.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(user);
                }}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                  index === highlight
                    ? "bg-surface-muted text-strong"
                    : "text-medium hover:bg-surface-muted",
                )}
              >
                <Avatar name={user.name} size="sm" />
                <span className="min-w-0 flex-1 truncate">{user.name}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
