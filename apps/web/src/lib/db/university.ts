import { prisma } from "@jumpflow/database";
import type { AppUser } from "@/lib/auth/types";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { computeRanking, gamificationForConsultant } from "@/lib/university/points";
import { computeTrackProgress } from "@/lib/university/track-progress";
import type {
  CatalogCourseView,
  CatalogTrackView,
  CourseView,
  EnrollmentStatus,
  LearningStatus,
  MyGamification,
  RankingRow,
  TrackOption,
  TrackView,
} from "@/lib/university/types";
import { isDatabaseConfigured } from "./config";

/**
 * Prisma reads/derivations da Universidade Jump (EP 7.3).
 *
 * Pontos/ranking e progresso de trilha são DERIVADOS (lib/university/*), nunca
 * persistidos. O escopo por linha (consultor só vê/mexe nas próprias matrículas)
 * é aplicado aqui — nunca confiar no cliente. As funções assumem que a rota já
 * autenticou; a curadoria é gated por papel no action.
 */

function decimalToNumber(value: { toString(): string } | null): number | null {
  return value === null ? null : Number(value.toString());
}

// ── Curadoria: trilhas e cursos ─────────────────────────────────────────────

/** Trilhas (ativas + inativas) com contagem de cursos, para a curadoria. */
export async function listTracks(): Promise<TrackView[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.learningTrack.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      status: true,
      courses: { select: { status: true } },
    },
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    status: row.status as LearningStatus,
    activeCourseCount: row.courses.filter((c) => c.status === "ACTIVE").length,
    totalCourseCount: row.courses.length,
  }));
}

/** Cursos (ativos + inativos) com vínculos, para a curadoria. */
export async function listCourses(): Promise<CourseView[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.course.findMany({
    select: {
      id: true,
      trackId: true,
      track: { select: { title: true } },
      title: true,
      provider: true,
      hours: true,
      externalUrl: true,
      skillId: true,
      skill: { select: { name: true } },
      status: true,
      _count: { select: { enrollments: true } },
    },
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    trackId: row.trackId,
    trackTitle: row.track?.title ?? null,
    title: row.title,
    provider: row.provider,
    hours: decimalToNumber(row.hours),
    externalUrl: row.externalUrl,
    skillId: row.skillId,
    skillName: row.skill?.name ?? null,
    status: row.status as LearningStatus,
    enrollmentCount: row._count.enrollments,
  }));
}

/** Trilhas ATIVAS para o seletor de curso. */
export async function listTrackOptions(): Promise<TrackOption[]> {
  if (!isDatabaseConfigured()) return [];
  const rows = await prisma.learningTrack.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, title: true },
    orderBy: { title: "asc" },
  });
  return rows.map((r) => ({ id: r.id, title: r.title }));
}

// ── Catálogo do consultor (navegação + sua matrícula + progresso) ───────────

/**
 * Catálogo de trilhas ATIVAS com cursos ATIVOS e a matrícula DO PRÓPRIO
 * consultor (escopo por linha). Cursos avulsos (sem trilha) são agrupados numa
 * pseudo-trilha "Cursos avulsos". Progresso de trilha derivado. Sem consultor
 * vinculado → catálogo sem matrículas (navegação read-only).
 */
export async function getCatalogForConsultant(
  user: AppUser,
): Promise<{ tracks: CatalogTrackView[]; standalone: CatalogTrackView | null }> {
  if (!isDatabaseConfigured()) return { tracks: [], standalone: null };
  const consultant = await getConsultantForUser(user);
  const consultantId = consultant?.id ?? null;

  const courses = await prisma.course.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      trackId: true,
      title: true,
      provider: true,
      hours: true,
      externalUrl: true,
      skillId: true,
      skill: { select: { name: true } },
      track: {
        select: { id: true, title: true, description: true, category: true },
      },
      enrollments: consultantId
        ? {
            where: { consultantId },
            select: {
              id: true,
              status: true,
              progressPct: true,
              hoursCompleted: true,
              completedAt: true,
            },
          }
        : false,
    },
    orderBy: [{ title: "asc" }],
  });

  type Bucket = {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    courses: CatalogCourseView[];
    /** Para o progresso da trilha. */
    statuses: (EnrollmentStatus | null)[];
  };
  const buckets = new Map<string, Bucket>();
  const STANDALONE_KEY = "__standalone__";

  for (const c of courses) {
    const key = c.trackId ?? STANDALONE_KEY;
    const bucket =
      buckets.get(key) ??
      ({
        id: c.track?.id ?? STANDALONE_KEY,
        title: c.track?.title ?? "Cursos avulsos",
        description: c.track?.description ?? null,
        category: c.track?.category ?? null,
        courses: [],
        statuses: [],
      } satisfies Bucket);

    const enrollmentRows = (c as { enrollments?: Array<{
      id: string;
      status: string;
      progressPct: number;
      hoursCompleted: { toString(): string };
      completedAt: Date | null;
    }> }).enrollments;
    const e = enrollmentRows?.[0] ?? null;
    const enrollment = e
      ? {
          id: e.id,
          status: e.status as EnrollmentStatus,
          progressPct: e.progressPct,
          hoursCompleted: Number(e.hoursCompleted.toString()),
          completedAt: e.completedAt
            ? e.completedAt.toISOString().slice(0, 10)
            : null,
        }
      : null;

    bucket.courses.push({
      id: c.id,
      title: c.title,
      provider: c.provider,
      hours: decimalToNumber(c.hours),
      externalUrl: c.externalUrl,
      skillId: c.skillId,
      skillName: c.skill?.name ?? null,
      enrollment,
    });
    bucket.statuses.push(enrollment?.status ?? null);
    buckets.set(key, bucket);
  }

  const toView = (b: Bucket): CatalogTrackView => {
    const progress = computeTrackProgress(
      b.statuses.map((s) => ({
        courseStatus: "ACTIVE" as const,
        enrollmentStatus: s,
      })),
    );
    return {
      id: b.id,
      title: b.title,
      description: b.description,
      category: b.category,
      courses: b.courses,
      progressPct: progress.progressPct,
      completedCourses: progress.completedCourses,
      totalCourses: progress.totalCourses,
    };
  };

  const tracks: CatalogTrackView[] = [];
  let standalone: CatalogTrackView | null = null;
  for (const [key, b] of buckets) {
    if (key === STANDALONE_KEY) standalone = toView(b);
    else tracks.push(toView(b));
  }
  tracks.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  return { tracks, standalone };
}

// ── Gamificação (DERIVADA) ──────────────────────────────────────────────────

/** Lê todas as conclusões (matrículas COMPLETED) para alimentar a gamificação. */
async function loadCompletions(): Promise<
  { consultantId: string; consultantName: string; courseHours: number | null }[]
> {
  const rows = await prisma.enrollment.findMany({
    where: { status: "COMPLETED", consultant: { status: "ACTIVE" } },
    select: {
      consultantId: true,
      consultant: { select: { name: true } },
      course: { select: { hours: true } },
    },
  });
  return rows.map((r) => ({
    consultantId: r.consultantId,
    consultantName: r.consultant.name,
    courseHours: decimalToNumber(r.course.hours),
  }));
}

/** Ranking agregado da empresa (lista com nomes). Gating de papel no action/page. */
export async function getRanking(): Promise<RankingRow[]> {
  if (!isDatabaseConfigured()) return [];
  const completions = await loadCompletions();
  return computeRanking(completions);
}

/** Gamificação do PRÓPRIO consultor (pontos + posição). null se sem consultor. */
export async function getMyGamification(
  user: AppUser,
): Promise<MyGamification | null> {
  if (!isDatabaseConfigured()) return null;
  const consultant = await getConsultantForUser(user);
  if (!consultant) return null;
  const completions = await loadCompletions();
  const g = gamificationForConsultant(completions, consultant.id);
  return {
    points: g.points,
    completedCourses: g.completedCourses,
    hoursCompleted: g.hoursCompleted,
    position: g.position,
    totalRanked: g.totalRanked,
  };
}
