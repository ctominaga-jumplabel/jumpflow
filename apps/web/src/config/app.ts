const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "JumpFlow";

/**
 * The parent company behind the product. Internal tooling wears the product
 * brand (JumpFlow); anything that leaves the building — client-facing email —
 * wears the company brand (Jump). Configurable to keep both easy to rename.
 */
const companyName = (process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Jump").trim();

/** Public origin of the deployed app, normalized without a trailing slash. */
const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");

/**
 * External JumpAcademy portal (separate app, same Entra ID tenant). Kept in
 * config so the URL is easy to change/rename. Normalized without a trailing
 * slash. Defaults to the known production portal.
 */
const academyUrl = (
  process.env.NEXT_PUBLIC_JUMP_ACADEMY_URL ?? "https://academy.jump.tec.br"
)
  .trim()
  .replace(/\/+$/, "");

/**
 * Company logo for client-facing email. Resolves to an explicit URL when set;
 * otherwise, once the asset lives at `public/brand/jump-logo.png`, derives it
 * from the public origin. Kept null when neither is available so the shell
 * degrades to the company monogram instead of rendering a broken image.
 *
 * NOTE: the derived path is only enabled after the Jump logo asset is added —
 * flip COMPANY_LOGO_ASSET_READY to true (or set NEXT_PUBLIC_COMPANY_LOGO_URL).
 */
const COMPANY_LOGO_ASSET_READY = true;
const companyLogoUrl =
  (process.env.NEXT_PUBLIC_COMPANY_LOGO_URL ?? "").trim() ||
  (COMPANY_LOGO_ASSET_READY && appUrl ? `${appUrl}/brand/jump-logo.png` : "") ||
  null;

/** Derive a short monogram for the brand mark from the configured app name. */
function deriveMonogram(name: string): string {
  const caps = name.replace(/[^A-Z]/g, "");
  if (caps.length >= 2) return caps.slice(0, 2);

  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();

  return name.slice(0, 2).toUpperCase();
}

export const appConfig = {
  name: appName,
  monogram: deriveMonogram(appName),
  /** Public origin (https) of the deployed app, or null when not configured. */
  url: appUrl || null,
  /** Bare host of the public origin (e.g. "app.jumpflow.com"), or null. */
  host: appUrl ? appUrl.replace(/^https?:\/\//, "") : null,
  /** External JumpAcademy portal URL (opens in a new tab from the sidebar). */
  academyUrl,
  /**
   * Absolute https URL of the brand logo, suitable for `<img src>` in email.
   * Email clients cannot fetch app-relative assets, so this is only available
   * when NEXT_PUBLIC_APP_URL is set (production/preview). Falls back to null so
   * the email shell can degrade to the textual monogram.
   */
  logoUrl: appUrl ? `${appUrl}/brand/jumpflow-logo.png` : null,
  /**
   * Company brand (Jump) used for anything client-facing. Internal operational
   * email keeps the product brand above; email that leaves the building wears
   * this one.
   */
  company: {
    name: companyName,
    monogram: deriveMonogram(companyName),
    logoUrl: companyLogoUrl,
  },
};
