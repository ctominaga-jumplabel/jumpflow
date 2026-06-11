/**
 * Shared response helpers for the Relatorios CSV route handlers
 * (docs/relatorios-fechamento.md section 8). All exports are pure framework
 * glue — RBAC and scope live in `lib/db/reports.ts`.
 */

/** 503 when no database is configured (caller guard). */
export function noDatabaseResponse(): Response {
  return new Response("NO_DATABASE", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** 400 for invalid filter input. */
export function invalidInputResponse(): Response {
  return new Response("INVALID_INPUT", {
    status: 400,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** A `text/csv` attachment with no caching. */
export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Filename range slug: `{from}_{to}`, falling back to `tudo`. */
export function rangeSlug(from?: string, to?: string): string {
  if (from && to) return `${from}_${to}`;
  if (from) return `${from}_tudo`;
  if (to) return `tudo_${to}`;
  return "tudo";
}

/** Consolidated period slug: month, range or `tudo`. */
export function periodSlug(
  month?: string,
  from?: string,
  to?: string,
): string {
  if (month) return month;
  return rangeSlug(from, to);
}
