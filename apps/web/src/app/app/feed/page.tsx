import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Megaphone } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedView } from "@/components/feed/FeedView";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import { listFeed, resolveCapabilities } from "@/lib/db/feed";
import { isFeedEnabled } from "@/lib/feed/flags";
import { isStorageConfigured } from "@/lib/storage/provider";

export const metadata: Metadata = { title: "Feed" };

/**
 * Feed social interno (Melhoria #5). Server Component:
 * - guarded by the feature flag (notFound when off — the route stays invisible);
 * - RBAC by the permission matrix (FEED.view) — everyone active in v1;
 * - loads the first keyset page + the viewer's capabilities and hands them to
 *   the client view. The body (composer/reactions/comments) is interactive, but
 *   the initial data is server-rendered for a fast first paint.
 */
export default async function FeedPage() {
  if (!isFeedEnabled()) notFound();

  const user = await requirePermission("FEED", "view");
  const databaseReady = isDatabaseConfigured();

  if (!databaseReady) {
    // O feed é conteúdo social persistido; sem banco não há fallback honesto.
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Pessoas"
          title="Feed"
          description="Comunicados, conquistas e conversas do time."
        />
        <EmptyState
          icon={Megaphone}
          title="Banco de dados não configurado"
          description="O Feed depende de dados persistidos. Configure o banco para publicar e acompanhar as conversas do time."
        />
      </div>
    );
  }

  const [page, canCreate, canDelete] = await Promise.all([
    listFeed(user, { cursor: null }),
    can("FEED", "create"),
    can("FEED", "delete"),
  ]);
  const capabilities = resolveCapabilities(user, { canCreate, canDelete });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Feed"
        description="Comunicados, conquistas e conversas do time. Publique, comente e reaja — tudo visível para a empresa toda."
      />
      <FeedView
        initialPosts={page.posts}
        initialCursor={page.nextCursor}
        capabilities={capabilities}
        storageEnabled={isStorageConfigured()}
        authorName={user.name}
      />
    </div>
  );
}
