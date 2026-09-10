/**
 * Shared style fragments to keep the design system consistent.
 * Source of truth: docs/identidade-visual-playful-ops.md and docs/design-system.md.
 *
 * The Playful Ops direction reserves strong borders + hard ("brutalist") shadows
 * for high-value elements — CTAs, KPIs, key cards and empty states. Lists,
 * tables and forms stay on the soft 1px border to remain scannable.
 */

/**
 * Standard keyboard focus ring for interactive elements (buttons, links).
 * Uses the brand (action) color with a 2px ring and offset against the
 * surrounding surface, matching the design system's focus treatment.
 *
 * Compose with `cn(focusRing, ...)`.
 */
export const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/**
 * Focus treatment for text inputs. Inputs read better with a colored border +
 * soft ring than with an offset ring, so they use a dedicated fragment instead
 * of `focusRing`. Keeps input focus consistent as more fields are added.
 */
export const focusRingInput =
  "outline-none focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

/** Playful Ops strong border (ink, 2px). Use on high-value framed elements. */
export const brutalBorder = "border-2 border-ink";

/** Hard offset shadow for high-value elements (KPIs, key cards, CTAs). */
export const brutalShadow = "shadow-[4px_4px_0_0_var(--color-ink)]";

/** Smaller hard shadow for compact elements (nav items, chips, icon blocks). */
export const brutalShadowSm = "shadow-[2px_2px_0_0_var(--color-ink)]";

/** Pressed-state hard shadow (depth collapses toward the surface). */
export const brutalShadowPressed = "shadow-[1px_1px_0_0_var(--color-ink)]";

/**
 * Tactile button: strong ink border + hard shadow that lifts on hover and
 * "presses" into the surface on click. Pair with a background + text color.
 * Motion is transform/shadow only, so `prefers-reduced-motion` (handled
 * globally in globals.css) neutralizes it gracefully.
 *
 * Compose with `cn(tactileButton, focusRing, "bg-brand text-white")`.
 */
export const tactileButton =
  "border-2 border-ink shadow-[3px_3px_0_0_var(--color-ink)] transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_var(--color-ink)]";

/* ─────────────────────────────────────────────────────────────────────────
 * Direção "Operational Minimal" (telas /nova de Horas e Aprovações).
 *
 * Tratamento alternativo, em validação lado a lado com o Playful Ops acima.
 * A diferença é DE MOLDURA E DENSIDADE, não de cor: a cor de ação continua
 * sendo `--brand`. Isso é deliberado — o A/B isola uma variável por vez, e a
 * troca do azul pelo laranja da referência é uma decisão de identidade que
 * ainda não foi tomada (ver docs/design-system.md §4).
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Painel "quiet": hairline de 1px, sem sombra dura, raio maior. Contraparte
 * calma de `brutalBorder + brutalShadow` para telas densas de operação, onde
 * a moldura forte compete com o dado.
 */
export const quietPanel =
  "rounded-[var(--radius-panel)] border border-border bg-surface";

/**
 * Micro-rótulo de campo/coluna: caixa alta com tracking, um passo abaixo do
 * texto do dado. Substitui o `text-xs font-semibold` sentence-case nas telas
 * quiet, onde o rótulo precisa recuar para o dado avançar.
 */
export const opsLabel =
  "text-[10px] font-medium uppercase tracking-[0.12em] text-soft";

/**
 * Números operacionais (hora, saldo, relógio). Monoespaçado + tabular para
 * que colunas de tempo alinhem por dígito. Use em QUALQUER valor de tempo nas
 * telas quiet; `tabular-nums` sozinho não alinha entre linhas com larguras de
 * glifo diferentes na Geist Sans.
 */
export const opsNum = "font-mono tabular-nums";
