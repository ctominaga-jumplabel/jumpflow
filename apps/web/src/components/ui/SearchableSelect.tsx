"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Drop-in replacement for a native single `<select>`: renders an editable
 * combobox that filters the existing options as the user types.
 *
 * A real `<select>` is still rendered (visually hidden) and stays the source of
 * truth. Every prop — `id`, `name`, `value`/`defaultValue`, `onChange`,
 * `required`, `disabled` — goes to it untouched, so labels (`htmlFor`), GET
 * forms, `FormData`, controlled/uncontrolled usage and `e.target.value`
 * handlers keep working exactly as before. Picking an option sets the native
 * value and dispatches a real `change` event, so React's `onChange` fires with
 * a genuine `ChangeEvent<HTMLSelectElement>`.
 *
 * Options are read back from the rendered `<option>`/`<optgroup>` children, so
 * callers keep writing ordinary options (mapped arrays, fragments, groups).
 */

type Option = {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
};

type Snapshot = {
  value: string;
  options: Option[];
  disabled: boolean;
  labelledBy?: string;
};

const valueSetter =
  typeof window === "undefined"
    ? undefined
    : Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")
        ?.set;

/** Lowercase + strip accents so "acao" matches "Ação". */
function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function readSnapshot(select: HTMLSelectElement): Snapshot {
  const options: Option[] = Array.from(select.options).map((o) => ({
    value: o.value,
    label: (o.label || o.textContent || "").trim(),
    disabled: o.disabled,
    group:
      o.parentElement instanceof HTMLOptGroupElement
        ? o.parentElement.label
        : undefined,
  }));

  // Hand the native label(s) over to the visible combobox so screen readers
  // announce the same name the select had.
  const labelIds: string[] = [];
  select.labels?.forEach((label, i) => {
    if (!label.id) label.id = `${select.id || "ss"}-label-${i}`;
    labelIds.push(label.id);
  });

  return {
    value: select.value,
    options,
    disabled: select.disabled,
    labelledBy: labelIds.length ? labelIds.join(" ") : undefined,
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  if (
    a.value !== b.value ||
    a.disabled !== b.disabled ||
    a.labelledBy !== b.labelledBy ||
    a.options.length !== b.options.length
  ) {
    return false;
  }
  return a.options.every((o, i) => {
    const p = b.options[i];
    return (
      o.value === p.value &&
      o.label === p.label &&
      o.disabled === p.disabled &&
      o.group === p.group
    );
  });
}

const EMPTY: Snapshot = { value: "", options: [], disabled: false };

export type SearchableSelectProps = React.ComponentPropsWithoutRef<"select">;

export const SearchableSelect = forwardRef<
  HTMLSelectElement,
  SearchableSelectProps
>(function SearchableSelect(props, forwardedRef) {
  const {
    className,
    style,
    multiple,
    placeholder,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    onFocus,
    ...selectProps
  } = props as SearchableSelectProps & { placeholder?: string };

  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  useImperativeHandle(forwardedRef, () => selectRef.current!, []);

  const listId = useId();
  const [snap, setSnap] = useState<Snapshot>(EMPTY);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Re-read the native select after every render: options and the controlled
  // value are owned by the caller and can change on any parent update.
  // Runs on every render on purpose; `sameSnapshot` stops the update loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const select = selectRef.current;
    if (!select) return;
    const next = readSnapshot(select);
    setSnap((prev) => (sameSnapshot(prev, next) ? prev : next));
  });

  // Uncontrolled selects can also change without a React render (form reset).
  useEffect(() => {
    const select = selectRef.current;
    const form = select?.form;
    if (!select || !form) return;
    const onReset = () =>
      requestAnimationFrame(() => setSnap(readSnapshot(select)));
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const selected = snap.options.find((o) => o.value === snap.value);
  const selectedLabel = selected?.label ?? "";
  // An empty-value option ("Todos", "Selecione...") reads as a placeholder so
  // typing starts from a clean field.
  const showsPlaceholder = !selected || selected.value === "";
  const displayValue = showsPlaceholder ? "" : selectedLabel;
  const placeholderText = showsPlaceholder
    ? selectedLabel || placeholder || "Selecione..."
    : undefined;

  const filtered = useMemo(() => {
    if (!query) return snap.options;
    const q = normalize(query);
    return snap.options.filter((o) => normalize(o.label).includes(q));
  }, [query, snap.options]);

  const updateRect = useCallback(() => {
    if (!inputRef.current) return;
    // The list is portaled into <body>, which carries a global CSS `zoom`
    // (globals.css): its `top/left` are scaled by that zoom while the rect is
    // in viewport pixels, so convert back into body coordinates.
    const body = document.body as HTMLElement & { currentCSSZoom?: number };
    const zoom =
      body.currentCSSZoom ?? (Number(getComputedStyle(body).zoom) || 1);
    const r = inputRef.current.getBoundingClientRect();
    setRect(
      new DOMRect(r.left / zoom, r.top / zoom, r.width / zoom, r.height / zoom),
    );
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [open, updateRect]);

  // Keep the highlighted option scrolled into view while navigating by keys.
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-index="${active}"]`,
    );
    el?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  function openList() {
    if (snap.disabled) return;
    const index = filtered.findIndex((o) => o.value === snap.value);
    setActive(index >= 0 ? index : 0);
    setOpen(true);
  }

  function close() {
    setOpen(false);
    setQuery(null);
  }

  function commit(option: Option | undefined) {
    const select = selectRef.current;
    close();
    if (!select || !option || option.disabled) return;
    if (option.value !== select.value) {
      valueSetter?.call(select, option.value);
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setSnap(readSnapshot(select));
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault();
        if (!open) {
          openList();
          return;
        }
        const step = event.key === "ArrowDown" ? 1 : -1;
        const count = filtered.length;
        if (count === 0) return;
        setActive((i) => (i + step + count) % count);
        return;
      }
      case "Home":
      case "End":
        if (!open) return;
        event.preventDefault();
        setActive(event.key === "Home" ? 0 : Math.max(filtered.length - 1, 0));
        return;
      case "Enter":
        if (!open) return;
        event.preventDefault();
        commit(filtered[active]);
        return;
      case "Escape":
        if (!open) return;
        // Don't let a surrounding Modal close along with the list.
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case "Tab":
        if (open && query) commit(filtered[active]);
        else close();
        return;
    }
  }

  const hasCustomArrow = /\bappearance-none\b/.test(className ?? "");

  const list =
    open && rect && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-labelledby={snap.labelledBy}
            aria-label={snap.labelledBy ? undefined : ariaLabel}
            className="fixed z-[70] max-h-64 overflow-auto rounded-md border border-border bg-surface py-1 text-sm text-strong shadow-lg"
            style={{
              top: rect.bottom + 4,
              left: rect.left,
              minWidth: rect.width,
              maxWidth: Math.max(rect.width, 360),
            }}
            // Keep focus in the input while clicking the list.
            onMouseDown={(e) => e.preventDefault()}
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-soft">Nenhuma opção encontrada</li>
            ) : (
              filtered.map((option, index) => {
                const showGroup =
                  option.group &&
                  option.group !== filtered[index - 1]?.group;
                return (
                  <li key={`${option.group ?? ""}:${option.value}:${index}`}>
                    {showGroup ? (
                      <div
                        role="presentation"
                        className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-soft"
                      >
                        {option.group}
                      </div>
                    ) : null}
                    <div
                      id={`${listId}-${index}`}
                      data-index={index}
                      role="option"
                      aria-selected={option.value === snap.value}
                      aria-disabled={option.disabled || undefined}
                      className={cn(
                        "cursor-pointer px-3 py-1.5",
                        index === active && "bg-brand-soft",
                        option.value === snap.value && "font-semibold",
                        option.disabled && "cursor-not-allowed opacity-50",
                      )}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => commit(option)}
                    >
                      {option.label || " "}
                    </div>
                  </li>
                );
              })
            )}
          </ul>,
          document.body,
        )
      : null;

  if (multiple) {
    return (
      <select
        ref={selectRef}
        multiple
        className={className}
        style={style}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        onFocus={onFocus}
        {...selectProps}
      />
    );
  }

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={
          open && filtered[active] ? `${listId}-${active}` : undefined
        }
        aria-labelledby={snap.labelledBy}
        aria-label={snap.labelledBy ? undefined : ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={selectProps.required || undefined}
        disabled={snap.disabled || selectProps.disabled}
        className={cn(className, !hasCustomArrow && "pr-8")}
        style={
          hasCustomArrow
            ? style
            : {
                backgroundImage:
                  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.6rem center",
                backgroundSize: "1rem",
                ...style,
              }
        }
        value={query ?? displayValue}
        placeholder={placeholderText}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={(e) => {
          e.currentTarget.select();
        }}
        onClick={() => (open ? undefined : openList())}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      <select
        ref={selectRef}
        {...selectProps}
        aria-hidden="true"
        tabIndex={-1}
        className="sr-only"
        // Label clicks and programmatic focus land on the hidden select;
        // forward them to the visible combobox.
        onFocus={(e) => {
          onFocus?.(e);
          inputRef.current?.focus();
        }}
        onInvalid={(e) => {
          selectProps.onInvalid?.(e);
          inputRef.current?.focus();
        }}
      />
      {list}
    </>
  );
});
