import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { inlinePreviewHtml } from "@/lib/automation/email/inline-assets";
import { EmailPreview } from "./EmailPreview";
import { SAMPLE_EMAILS } from "./samples";

/**
 * Email preview & test tool — development-only route (`/app/dev/emails`).
 *
 * Renders every JumpFlow operational template with sample data (accurate to
 * what gets sent) and lets you send a real test to your own inbox using the
 * configured transport. 404 in production; behind the authenticated shell.
 */
export const dynamic = "force-dynamic";

export default async function EmailPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const user = await requireUser();

  const previews = SAMPLE_EMAILS.map((sample) => {
    const built = sample.build(user.name ?? "Christopher");
    return {
      key: sample.key,
      label: sample.label,
      subject: built.subject,
      // The email uses `cid:` logo refs (inline on real sends); the browser
      // preview can't resolve those, so swap them to the public https URL.
      html: inlinePreviewHtml(built.html),
    };
  });

  return (
    <EmailPreview
      previews={previews}
      defaultRecipient={user.email}
      provider={process.env.EMAIL_PROVIDER ?? "console"}
    />
  );
}
