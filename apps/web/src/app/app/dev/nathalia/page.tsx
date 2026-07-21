import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guards";
import { NathaliaLab } from "./NathaliaLab";

/**
 * Nathal.IA Lab — development-only route (`/app/dev/nathalia`).
 *
 * Hidden in production: returns 404 unless `NODE_ENV !== "production"`. Still
 * behind the authenticated app shell (`requireUser`). It lets developers drive
 * the assistant's visual states, context, intents, brain responses and
 * proactive nudges without an LLM.
 */
export const dynamic = "force-dynamic";

export default async function NathaliaLabPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  const user = await requireUser();
  return <NathaliaLab initialRoles={user.roles} />;
}
