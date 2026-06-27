/**
 * Feed social interno (Melhoria #5) → notification orchestration.
 *
 * Reaproveita o motor de notificações existente (templates de marca, dispatch
 * com agrupamento por destinatário, AutomationEmailLog para idempotência) SEM
 * criar canal novo. Diferente dos eventos da Onda 2, aqui o destinatário NÃO
 * vem dos `rule.recipients`: é sempre o AUTOR do alvo (post/comentário) que
 * recebeu a interação. A NotificationRule serve só como liga/desliga por evento
 * (fail-open: sem regra ativa, nada é enviado — igual ao resto do motor).
 *
 * Regras de produto:
 *  - Nunca notificar a si mesmo (ator == autor do alvo → pular).
 *  - Respostas (FEED_POST_REPLIED): uma notificação por resposta, idempotente
 *    por commentId.
 *  - Reações (FEED_CONTENT_REACTED): uma notificação por reação NOVA, idempotente
 *    por reactionId. NÃO há janela de digest: cada reação nova chega em sua
 *    própria chamada (clique → action → emit), então usuários distintos geram um
 *    e-mail cada. A consolidação num único e-mail só ocorre quando há MAIS DE UMA
 *    reação pendente na mesma chamada (ex. um envio anterior falhou e ficou sem
 *    log SENT). O digest por janela real (enfileirar fragmentos + cron
 *    consolidando por destinatário) é evolução futura — exigiria fila persistida
 *    + cron, desproporcional para esta fatia (ver docs/infra-notificacoes.md §10).
 *
 * Best-effort: nunca lança na action hospedeira (toda falha é engolida/logada),
 * exatamente como o emit.ts/audit.
 */
import { prisma } from "@jumpflow/database";
import {
  buildFeedDigestEmail,
  type FeedDigestItem,
} from "@/lib/automation/email/templates";
import {
  dispatchNotifications,
  type NotificationFragment,
  type ResolvedRecipient,
} from "@/lib/automation/notifications/dispatch";
import { isDatabaseConfigured } from "@/lib/db/config";

type FeedNotificationEvent = "FEED_POST_REPLIED" | "FEED_CONTENT_REACTED";

/** CTA "Abrir o Feed" quando a URL pública do app está configurada. */
function feedUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/app/feed`
    : undefined;
}

/** referenceKey estável para o AutomationEmailLog (idempotência por item). */
function referenceKey(event: FeedNotificationEvent, itemId: string): string {
  return `${event}:${itemId}`;
}

/** Há ao menos uma regra ATIVA para o evento? (fail-open: senão, não envia.) */
async function eventEnabled(event: FeedNotificationEvent): Promise<boolean> {
  const count = await prisma.notificationRule.count({
    where: { event, active: true },
  });
  return count > 0;
}

/**
 * Filtra os itemIds que ainda NÃO foram entregues (status SENT) para este
 * destinatário+evento. Retorna o subconjunto pendente, preservando a ordem.
 */
async function pendingItemIds(
  event: FeedNotificationEvent,
  itemIds: string[],
): Promise<string[]> {
  if (itemIds.length === 0) return [];
  const refs = itemIds.map((id) => referenceKey(event, id));
  const existing = await prisma.automationEmailLog.findMany({
    where: { type: "NOTIFICATION", referenceKey: { in: refs }, status: "SENT" },
    select: { referenceKey: true },
  });
  const sent = new Set(existing.map((e) => e.referenceKey));
  return itemIds.filter((id) => !sent.has(referenceKey(event, id)));
}

/**
 * Despacha UM digest para o autor do alvo e registra um log por item (idempotente
 * por reactionId/commentId). `event` define o referenceKey de cada item.
 */
async function dispatchFeedDigest(input: {
  event: FeedNotificationEvent;
  recipient: ResolvedRecipient;
  items: FeedDigestItem[];
  /** Ids que compõem este digest — uma linha de log SENT por id. */
  itemIds: string[];
}): Promise<void> {
  const built = buildFeedDigestEmail({
    recipientName: input.recipient.name ?? "você",
    items: input.items,
    feedUrl: feedUrl(),
  });

  const fragment: NotificationFragment = {
    recipient: input.recipient,
    title: built.subject,
    prebuilt: built,
  };

  const [result] = await dispatchNotifications([fragment]);
  if (!result) return;

  // Idempotência por item: marca cada interação consolidada como entregue. Numa
  // próxima chamada, esses ids são filtrados por pendingItemIds e não repetem.
  for (const itemId of input.itemIds) {
    const ref = referenceKey(input.event, itemId);
    await prisma.automationEmailLog
      .upsert({
        where: {
          type_referenceKey: { type: "NOTIFICATION", referenceKey: ref },
        },
        create: {
          type: "NOTIFICATION",
          referenceKey: ref,
          recipient: result.recipientKey,
          status: result.status,
          error: result.error ?? null,
          meta: {
            event: input.event,
            channel: result.channel,
            messageId: result.messageId,
            fragments: result.fragments,
          },
        },
        update: {
          status: result.status,
          error: result.error ?? null,
          meta: {
            event: input.event,
            channel: result.channel,
            messageId: result.messageId,
            fragments: result.fragments,
          },
        },
      })
      .catch((e) => {
        console.error("[feed-notification] failed to log delivery", { ref, error: e });
      });
  }
}

/** Resolve o autor de um alvo num ResolvedRecipient de e-mail (ou null). */
function authorToRecipient(
  author: { id: string; name: string; email: string } | null | undefined,
): ResolvedRecipient | null {
  if (!author?.email) return null;
  return {
    key: author.email.toLowerCase(),
    channel: "EMAIL",
    address: author.email,
    name: author.name ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// FEED_POST_REPLIED — alguém comentou (respondeu) um post. Notifica o AUTOR do
// post. dedupeKey = commentId (idempotente por resposta).
// ---------------------------------------------------------------------------
export async function notifyFeedReplied(commentId: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    if (!(await eventEnabled("FEED_POST_REPLIED"))) return;

    const comment = await prisma.feedComment
      .findUnique({
        where: { id: commentId },
        select: {
          id: true,
          status: true,
          authorUserId: true,
          author: { select: { name: true } },
          post: {
            select: {
              status: true,
              authorUserId: true,
              author: { select: { id: true, name: true, email: true } },
            },
          },
        },
      })
      .catch(() => null);
    if (!comment || comment.status !== "VISIBLE") return;
    if (!comment.post || comment.post.status !== "VISIBLE") return;

    // Nunca notificar a si mesmo (autor da resposta == autor do post → pular).
    if (
      comment.authorUserId &&
      comment.post.authorUserId &&
      comment.authorUserId === comment.post.authorUserId
    ) {
      return;
    }

    const recipient = authorToRecipient(comment.post.author);
    if (!recipient) return;

    const pending = await pendingItemIds("FEED_POST_REPLIED", [comment.id]);
    if (pending.length === 0) return; // já notificada (idempotente)

    await dispatchFeedDigest({
      event: "FEED_POST_REPLIED",
      recipient,
      itemIds: pending,
      items: [
        {
          actorName: comment.author?.name ?? "Alguém",
          kind: "reply",
          target: "post",
        },
      ],
    });
  } catch (error) {
    console.error("[feed-notification] notifyFeedReplied failed", { commentId, error });
  }
}

// ---------------------------------------------------------------------------
// FEED_CONTENT_REACTED — alguém reagiu a um post OU comentário. Alto-volume:
// consolidamos TODAS as reações ainda não notificadas no alvo num ÚNICO digest
// para o AUTOR do alvo. Idempotência por reactionId.
// ---------------------------------------------------------------------------
export async function notifyFeedReacted(input: {
  /** Informe exatamente um: o alvo que recebeu a(s) reação(ões). */
  postId?: string;
  commentId?: string;
}): Promise<void> {
  if (!isDatabaseConfigured()) return;
  try {
    if (!(await eventEnabled("FEED_CONTENT_REACTED"))) return;

    // Resolve o autor do alvo + valida que está VISIBLE.
    let authorUserId: string | null = null;
    let recipient: ResolvedRecipient | null = null;
    const target: "post" | "comment" = input.postId ? "post" : "comment";

    if (input.postId) {
      const post = await prisma.feedPost
        .findUnique({
          where: { id: input.postId },
          select: {
            status: true,
            authorUserId: true,
            author: { select: { id: true, name: true, email: true } },
          },
        })
        .catch(() => null);
      if (!post || post.status !== "VISIBLE") return;
      authorUserId = post.authorUserId;
      recipient = authorToRecipient(post.author);
    } else if (input.commentId) {
      const comment = await prisma.feedComment
        .findUnique({
          where: { id: input.commentId },
          select: {
            status: true,
            authorUserId: true,
            author: { select: { id: true, name: true, email: true } },
          },
        })
        .catch(() => null);
      if (!comment || comment.status !== "VISIBLE") return;
      authorUserId = comment.authorUserId;
      recipient = authorToRecipient(comment.author);
    } else {
      return;
    }

    if (!recipient || !authorUserId) return;

    // Todas as reações ao alvo, EXCETO as do próprio autor (não notificar a si
    // mesmo). Ordenadas para um digest estável.
    const reactions = await prisma.feedReaction.findMany({
      where: {
        ...(input.postId ? { postId: input.postId } : { commentId: input.commentId }),
        userId: { not: authorUserId },
      },
      select: {
        id: true,
        emoji: true,
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    if (reactions.length === 0) return;

    // Idempotência por reactionId: só as reações ainda não notificadas entram no
    // digest desta chamada (re-rodar não duplica e-mail nem item).
    const pending = await pendingItemIds(
      "FEED_CONTENT_REACTED",
      reactions.map((r) => r.id),
    );
    if (pending.length === 0) return;
    const pendingSet = new Set(pending);
    const fresh = reactions.filter((r) => pendingSet.has(r.id));

    await dispatchFeedDigest({
      event: "FEED_CONTENT_REACTED",
      recipient,
      itemIds: fresh.map((r) => r.id),
      items: fresh.map((r) => ({
        actorName: r.user?.name ?? "Alguém",
        kind: "reaction" as const,
        emoji: r.emoji,
        target,
      })),
    });
  } catch (error) {
    console.error("[feed-notification] notifyFeedReacted failed", { input, error });
  }
}
