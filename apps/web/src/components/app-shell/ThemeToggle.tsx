"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { THEME_COOKIE, type Theme } from "@/lib/theme";

/**
 * Day/night toggle. The current theme is the single source of truth on
 * `<html data-theme>` (set by the server from the cookie, so there is no
 * flash). This button reads it via `useSyncExternalStore` — a MutationObserver
 * on the attribute — so it never drifts from the DOM and needs no local state.
 * Toggling flips the attribute for an instant, reload-free change and persists
 * the choice in a cookie the server layout honors on the next navigation.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// SSR renders the light (default) affordance; the client re-syncs to the real
// attribute on hydration. useSyncExternalStore handles this without a mismatch.
function getServerSnapshot(): Theme {
  return "light";
}

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === "dark";

  function toggle() {
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    // Persist ~1 year; path=/ so every route sees it; SameSite=Lax is enough
    // for a non-sensitive UI preference. Read by the server layout on next nav.
    document.cookie = `${THEME_COOKIE}=${next};path=/;max-age=31536000;samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={isDark ? "Ativar modo dia" : "Ativar modo noite"}
      title={isDark ? "Modo dia" : "Modo noite"}
      className={className}
    >
      {isDark ? (
        <Sun aria-hidden="true" className="size-5" />
      ) : (
        <Moon aria-hidden="true" className="size-5" />
      )}
    </button>
  );
}
