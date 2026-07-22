/**
 * Inline (CID) brand assets for outgoing email.
 *
 * Why: mail clients (Outlook above all) block REMOTE images by default —
 * `<img src="https://…">` shows "imagens bloqueadas" until the reader clicks
 * "mostrar conteúdo". An image that is PART of the message (a CID attachment)
 * is not remote, so clients render it inline without the prompt. So the email
 * layout references the logo as `cid:<id>` and this module attaches the actual
 * bytes.
 *
 * The bytes are fetched over HTTP from the app's own public asset (the same URL
 * the `<img>` used to point at) and embedded as base64. We fetch instead of
 * reading `public/` from disk because a Next.js serverless function is not
 * guaranteed to ship the static `public/` tree in its filesystem, whereas the
 * CDN always serves it. The result is memoized so repeated sends don't refetch.
 *
 * Every failure degrades gracefully: a missing URL or a failed fetch simply
 * skips the attachment, so the `<img>` falls back to its alt text — never worse
 * than today's blocked remote image, and it never throws in the send path.
 */
import { appConfig } from "@/config/app";
import type { EmailAttachment, EmailMessage } from "../email-transport";

/**
 * Content-IDs referenced as `cid:<id>` in the email HTML. Kept as stable tokens
 * so the layout and this resolver agree without threading values around.
 */
export const PRODUCT_LOGO_CID = "jumpflow-logo";
export const COMPANY_LOGO_CID = "jump-logo";

interface LogoAsset {
  cid: string;
  /** Public https URL of the asset, or null when the app origin isn't set. */
  url: string | null;
  filename: string;
}

function logoAssets(): LogoAsset[] {
  return [
    { cid: PRODUCT_LOGO_CID, url: appConfig.logoUrl, filename: "jumpflow-logo.png" },
    { cid: COMPANY_LOGO_CID, url: appConfig.company.logoUrl, filename: "jump-logo.png" },
  ];
}

/** url -> base64 content. Memoizes the fetched bytes across sends. */
const base64Cache = new Map<string, string>();

async function fetchBase64(url: string): Promise<string | null> {
  const cached = base64Cache.get(url);
  if (cached) return cached;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return null;
    const b64 = buf.toString("base64");
    base64Cache.set(url, b64);
    return b64;
  } catch {
    // Network/DNS failure: skip the inline asset, keep the send going.
    return null;
  }
}

/**
 * Attach, as inline (CID) parts, every brand logo the HTML references via a
 * `cid:` src. Idempotent: an asset already attached (by content-id) is skipped.
 * Returns the original message untouched when there's no HTML or nothing to
 * embed, so it's cheap to call on every outgoing email.
 */
export async function withInlineBrandAssets(
  message: EmailMessage,
): Promise<EmailMessage> {
  const html = message.html;
  if (!html) return message;

  const already = new Set(
    (message.attachments ?? [])
      .map((a) => a.contentId)
      .filter((id): id is string => Boolean(id)),
  );

  const additions: EmailAttachment[] = [];
  for (const asset of logoAssets()) {
    if (!asset.url) continue;
    if (already.has(asset.cid)) continue;
    if (!html.includes(`cid:${asset.cid}`)) continue;
    const content = await fetchBase64(asset.url);
    if (!content) continue;
    additions.push({
      filename: asset.filename,
      content,
      contentType: "image/png",
      contentId: asset.cid,
      encoding: "base64",
      disposition: "inline",
    });
  }

  if (additions.length === 0) return message;
  return {
    ...message,
    attachments: [...(message.attachments ?? []), ...additions],
  };
}

/**
 * For the dev preview iframe only: browsers can't resolve `cid:` refs, so swap
 * them back to the public https URL to show the logo in-page. Real sends keep
 * the `cid:` form and rely on {@link withInlineBrandAssets}.
 */
export function inlinePreviewHtml(html: string): string {
  let out = html;
  for (const asset of logoAssets()) {
    if (asset.url) out = out.split(`cid:${asset.cid}`).join(asset.url);
  }
  return out;
}

/** Reset the memoized asset bytes. Test seam. */
export function __clearInlineAssetCache(): void {
  base64Cache.clear();
}
