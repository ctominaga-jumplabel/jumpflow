/**
 * Day/night theme primitives shared by the server (root layout reads the
 * cookie to set <html data-theme> with no flash) and the client toggle.
 *
 * The cookie is intentionally NOT httpOnly: the client toggle writes it for
 * instant persistence and the server layout reads it on the next navigation.
 * It carries no sensitive data — only "light" | "dark".
 */
export const THEME_COOKIE = "jf-theme";

export type Theme = "light" | "dark";
