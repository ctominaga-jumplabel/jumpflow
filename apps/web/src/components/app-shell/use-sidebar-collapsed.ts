"use client";

import { useSyncExternalStore } from "react";

/**
 * Persisted "sidebar collapsed" preference for the desktop rail (P11).
 *
 * Implemented as a tiny external store read through `useSyncExternalStore` so
 * the value survives navigation/reload (localStorage) WITHOUT a hydration
 * mismatch and WITHOUT setting state inside an effect: the server snapshot is
 * always `false` (matching the initial SSR markup) and React reconciles to the
 * stored value right after hydration. Writes fan out to every subscriber and
 * to other tabs via the `storage` event.
 */
const STORAGE_KEY = "jumpflow.sidebar.collapsed";

let listeners: Array<() => void> = [];

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Client snapshot: the persisted preference. */
export function getSidebarCollapsedSnapshot(): boolean {
  return read();
}

/** Server/first-paint snapshot: always expanded (matches SSR markup). */
export function getSidebarCollapsedServerSnapshot(): boolean {
  return false;
}

/** Persist a new value and notify all subscribers. */
export function setSidebarCollapsed(next: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Ignore storage failures (private mode / quota): the in-memory notify
    // below still updates the current tab for this session.
  }
  for (const listener of listeners) listener();
}

/** Subscribe to preference changes (this tab + cross-tab `storage`). */
export function subscribeSidebarCollapsed(onChange: () => void): () => void {
  listeners.push(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners = listeners.filter((listener) => listener !== onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * Read the collapsed preference and a setter. Hydration-safe: renders expanded
 * on the server and the first client paint, then snaps to the stored value.
 */
export function useSidebarCollapsed(): readonly [boolean, (next: boolean) => void] {
  const collapsed = useSyncExternalStore(
    subscribeSidebarCollapsed,
    getSidebarCollapsedSnapshot,
    getSidebarCollapsedServerSnapshot,
  );
  return [collapsed, setSidebarCollapsed] as const;
}
