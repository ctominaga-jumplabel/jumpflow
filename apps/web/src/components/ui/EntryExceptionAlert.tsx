"use client";

import { TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  formatEntryExceptions,
  type EntryException,
} from "@/lib/timesheet/entry-exceptions";

/**
 * Sinal de exceção de lançamento (fim de semana, feriado, atividade fora do Dia
 * Útil) para DP e aprovadores. Apenas SINALIZA — nunca bloqueia.
 *
 * - `EntryExceptionAlert`: ícone por linha (um lançamento).
 * - `EntryExceptionCountBadge`: selo "N exceções" para listas agregadas por
 *   consultor, com as datas no tooltip.
 *
 * Tooltip acessível: o gatilho é um `<button>` focável por teclado, com
 * `aria-label` listando as exceções; abre em hover/foco/toque e fecha com Esc.
 * Renderiza em portal com `position: fixed`, então não é cortado por tabelas
 * com `overflow-x-auto`. Motion contido (fade curto), respeitando
 * `prefers-reduced-motion`.
 */

interface HintTooltipProps {
  /** Texto acessível do gatilho (lido por leitores de tela). */
  label: string;
  trigger: ReactNode;
  content: ReactNode;
  className?: string;
}

function HintTooltip({ label, trigger, content, className }: HintTooltipProps) {
  const id = useId();
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; below: boolean }>({
    top: 0,
    left: 0,
    below: false,
  });
  const reduce = useReducedMotion();

  const place = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Abre acima; sem espaço (topo da viewport), abre abaixo.
    const below = r.top < 96;
    setPos({
      top: below ? r.bottom + 6 : r.top - 6,
      left: Math.min(Math.max(r.left + r.width / 2, 140), window.innerWidth - 140),
      below,
    });
  }, []);

  const show = useCallback(() => {
    place();
    setOpen(true);
  }, [place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onScroll = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Toque (mobile): alterna. Não propaga para linhas clicáveis.
          e.stopPropagation();
          if (open) setOpen(false);
          else show();
        }}
        className={cn(
          "inline-flex shrink-0 items-center rounded-md align-middle",
          focusRing,
          className,
        )}
      >
        {trigger}
      </button>
      {typeof document !== "undefined"
        ? createPortal(
            <AnimatePresence>
              {open ? (
                <motion.div
                  id={id}
                  role="tooltip"
                  initial={{ opacity: 0, y: reduce ? 0 : pos.below ? -2 : 2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12, ease: "easeOut" }}
                  style={{
                    position: "fixed",
                    top: pos.top,
                    left: pos.left,
                    translateX: "-50%",
                    translateY: pos.below ? "0%" : "-100%",
                  }}
                  className="pointer-events-none z-[60] max-w-[260px] rounded-md border border-border bg-surface px-3 py-2 text-left text-xs leading-snug text-medium shadow-lg"
                >
                  {content}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </>
  );
}

export interface EntryExceptionAlertProps {
  exceptions: readonly EntryException[] | null | undefined;
  /** Rótulo do dia para o aria-label (ex.: "21/11"). */
  dateLabel?: string;
  className?: string;
}

/** Ícone de alerta por lançamento. Sem exceções => não renderiza nada. */
export function EntryExceptionAlert({
  exceptions,
  dateLabel,
  className,
}: EntryExceptionAlertProps) {
  if (!exceptions || exceptions.length === 0) return null;
  const summary = formatEntryExceptions(exceptions);
  return (
    <HintTooltip
      label={`Exceção${dateLabel ? ` em ${dateLabel}` : ""}: ${summary}`}
      className={cn("text-warning", className)}
      trigger={<TriangleAlert aria-hidden="true" className="size-3.5" />}
      content={
        <ul className="space-y-1">
          {exceptions.map((e) => (
            <li key={`${e.kind}-${e.label}`}>
              <span className="font-semibold text-strong">{e.label}</span>
              <span className="block text-soft">{e.detail}</span>
            </li>
          ))}
        </ul>
      }
    />
  );
}

export interface EntryExceptionCountBadgeProps {
  /** Quantidade de lançamentos com exceção. */
  count: number;
  /** Linhas do tooltip, ex.: "21/11 (Sáb): Sábado; Sobreaviso". */
  lines: readonly string[];
  className?: string;
}

/** Selo agregado "N exceções" (listas por consultor). count 0 => nada. */
export function EntryExceptionCountBadge({
  count,
  lines,
  className,
}: EntryExceptionCountBadgeProps) {
  if (count <= 0) return null;
  const text = `${count} ${count === 1 ? "exceção" : "exceções"}`;
  const MAX = 12;
  const shown = lines.slice(0, MAX);
  return (
    <HintTooltip
      label={`${text}: ${lines.join(" · ")}`}
      className={cn(
        "gap-1 bg-warning-soft px-1.5 py-0.5 text-xs font-semibold tabular-nums text-warning",
        className,
      )}
      trigger={
        <>
          <TriangleAlert aria-hidden="true" className="size-3.5" />
          {text}
        </>
      }
      content={
        <div className="space-y-1">
          <p className="font-semibold text-strong">{text}</p>
          <ul className="space-y-0.5">
            {shown.map((line) => (
              <li key={line} className="tabular-nums">
                {line}
              </li>
            ))}
          </ul>
          {lines.length > MAX ? (
            <p className="text-soft">+{lines.length - MAX} dia(s)</p>
          ) : null}
        </div>
      }
    />
  );
}
