"use client";

import { useState } from "react";
import { Award, BookOpen, Clock, Trophy } from "lucide-react";
import { FeedbackBanner, useFeedback } from "@/components/ui/Feedback";
import { MetricCard } from "@/components/ui/MetricCard";
import { cn } from "@/lib/utils";
import { focusRing } from "@/lib/styles";
import type {
  CatalogTrackView,
  CourseView,
  MyGamification,
  RankingRow,
  TrackOption,
  TrackView,
} from "@/lib/university/types";
import { CatalogPanel } from "./CatalogPanel";
import { CurationPanel } from "./CurationPanel";
import { RankingPanel } from "./RankingPanel";

type Tab = "catalogo" | "curadoria" | "ranking";

export interface UniversityViewProps {
  catalog: { tracks: CatalogTrackView[]; standalone: CatalogTrackView | null };
  myGamification: MyGamification | null;
  viewerConsultantId: string | null;
  canCurate: boolean;
  canViewRanking: boolean;
  tracks: TrackView[];
  courses: CourseView[];
  trackOptions: TrackOption[];
  skillOptions: { id: string; name: string }[];
  ranking: RankingRow[];
}

/**
 * Orquestrador da Universidade Jump (EP 7.3). Abas: Catálogo (matrícula/progresso
 * do próprio consultor), Curadoria (PEOPLE/ADMIN) e Ranking (gestão). A aba inicial
 * é derivada das permissões (sem useEffect). O que cada papel vê é decidido no
 * servidor; a UI só reflete (canCurate/canViewRanking).
 */
export function UniversityView({
  catalog,
  myGamification,
  viewerConsultantId,
  canCurate,
  canViewRanking,
  tracks,
  courses,
  trackOptions,
  skillOptions,
  ranking,
}: UniversityViewProps) {
  const { feedback, notify } = useFeedback();
  const [tab, setTab] = useState<Tab>("catalogo");

  const tabs: { id: Tab; label: string }[] = [
    { id: "catalogo", label: "Catálogo" },
    ...(canCurate ? [{ id: "curadoria" as const, label: "Curadoria" }] : []),
    ...(canViewRanking ? [{ id: "ranking" as const, label: "Ranking" }] : []),
  ];

  return (
    <div className="space-y-5">
      <FeedbackBanner message={feedback} />

      {myGamification ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Seus pontos"
            value={`${myGamification.points}`}
            icon={Award}
            hint="Derivados das suas conclusões"
            index={0}
          />
          <MetricCard
            label="Cursos concluídos"
            value={`${myGamification.completedCourses}`}
            icon={BookOpen}
            hint={`${myGamification.hoursCompleted}h acumuladas`}
            index={1}
          />
          <MetricCard
            label="Sua posição"
            value={
              myGamification.position
                ? `${myGamification.position}º`
                : "—"
            }
            icon={Trophy}
            hint={
              myGamification.position
                ? `de ${myGamification.totalRanked} no ranking`
                : "Conclua um curso para entrar no ranking"
            }
            index={2}
          />
        </div>
      ) : null}

      {tabs.length > 1 ? (
        <div
          role="tablist"
          aria-label="Seções da Universidade"
          className="flex flex-wrap gap-2"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md border-2 border-ink px-3 py-1.5 text-sm font-semibold",
                focusRing,
                tab === t.id
                  ? "bg-brand text-white shadow-[2px_2px_0_0_var(--color-ink)]"
                  : "bg-surface text-strong",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "catalogo" ? (
        <CatalogPanel
          tracks={catalog.tracks}
          standalone={catalog.standalone}
          notify={notify}
        />
      ) : null}

      {tab === "curadoria" && canCurate ? (
        <CurationPanel
          tracks={tracks}
          courses={courses}
          trackOptions={trackOptions}
          skillOptions={skillOptions}
          notify={notify}
        />
      ) : null}

      {tab === "ranking" && canViewRanking ? (
        <RankingPanel
          ranking={ranking}
          highlightConsultantId={viewerConsultantId}
        />
      ) : null}

      {!myGamification && tab === "ranking" ? null : null}
      {/* Resumo de horas para o consultor quando não há gamificação visível */}
      {myGamification === null && tab === "catalogo" ? (
        <p className="flex items-center gap-2 text-xs text-soft">
          <Clock aria-hidden className="size-3.5" />
          Vincule seu usuário a um consultor para se matricular e acompanhar
          progresso.
        </p>
      ) : null}
    </div>
  );
}
