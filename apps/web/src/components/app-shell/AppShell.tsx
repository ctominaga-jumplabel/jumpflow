"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export interface AppShellProps {
  children: React.ReactNode;
}

/**
 * Authenticated (mocked) application shell: persistent sidebar on desktop,
 * off-canvas drawer on mobile, and a sticky topbar.
 */
export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const reduce = useReducedMotion();
  const drawerRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // While the drawer is open: close on Escape, lock body scroll, move focus
  // into the drawer and restore it to the trigger when it closes. The main
  // column is marked `inert` (below) so focus cannot escape behind the overlay.
  useEffect(() => {
    if (!mobileOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    drawerRef.current
      ?.querySelector<HTMLElement>("a, button")
      ?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
      restoreFocusRef.current?.focus?.();
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen ? (
          <div className="lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-strong/40"
              aria-hidden="true"
            />
            <motion.aside
              ref={drawerRef}
              initial={reduce ? { opacity: 0 } : { x: "-100%" }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: "-100%" }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              role="dialog"
              aria-modal="true"
              aria-label="Navegação"
              className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85%] border-r border-border shadow-xl"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fechar navegação"
                className="absolute right-3 top-4 z-10 grid size-9 place-items-center rounded-md text-medium outline-none transition-colors hover:bg-surface-muted hover:text-strong focus-visible:ring-2 focus-visible:ring-brand"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        ) : null}
      </AnimatePresence>

      {/* Main column */}
      <div className="lg:pl-64" inert={mobileOpen || undefined}>
        <Topbar onMenuClick={() => setMobileOpen(true)} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
