import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { UniversityView } from "@/components/university/UniversityView";
import { requireUser } from "@/lib/auth/guards";
import { isDatabaseConfigured } from "@/lib/db/config";
import { getConsultantForUser } from "@/lib/db/timesheet";
import { listActiveSkillOptions } from "@/lib/db/competencies";
import {
  getCatalogForConsultant,
  getMyGamification,
  getRanking,
  listCourses,
  listTrackOptions,
  listTracks,
} from "@/lib/db/university";
import { canCurate, canViewRanking } from "@/lib/university/visibility";

export const metadata: Metadata = { title: "Universidade" };

export default async function UniversidadePage() {
  // Catálogo visível a todos os autenticados; curadoria/ranking gated por papel.
  const user = await requireUser();
  const databaseReady = isDatabaseConfigured();
  const curate = canCurate(user.roles);
  const ranking = canViewRanking(user.roles);

  if (!databaseReady) {
    // Degradação graciosa honesta: trilhas, cursos e matrículas são dados
    // persistidos; sem DB não há fallback silencioso para mock.
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Talentos"
          title="Universidade Jump"
          description="Trilhas e cursos de capacitação, matrícula, progresso e gamificação."
        />
        <EmptyState
          icon={BookOpen}
          title="Banco de dados não configurado"
          description="A Universidade consome trilhas, cursos e matrículas persistidos. Configure o banco para curar o catálogo e acompanhar o progresso."
        />
      </div>
    );
  }

  const [
    catalog,
    myGamification,
    viewerConsultant,
    tracks,
    courses,
    trackOptions,
    skillOptions,
    rankingRows,
  ] = await Promise.all([
    getCatalogForConsultant(user),
    getMyGamification(user),
    getConsultantForUser(user),
    curate ? listTracks() : Promise.resolve([]),
    curate ? listCourses() : Promise.resolve([]),
    curate ? listTrackOptions() : Promise.resolve([]),
    curate ? listActiveSkillOptions() : Promise.resolve([]),
    ranking ? getRanking() : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos"
        title="Universidade Jump"
        description="Navegue pelas trilhas e cursos, matricule-se e registre seu progresso. Ao concluir um curso ligado a uma competência, a conclusão vira evidência da sua skill. Pontos e ranking são derivados das conclusões."
      />
      <UniversityView
        catalog={catalog}
        myGamification={myGamification}
        viewerConsultantId={viewerConsultant?.id ?? null}
        canCurate={curate}
        canViewRanking={ranking}
        tracks={tracks}
        courses={courses}
        trackOptions={trackOptions}
        skillOptions={skillOptions.map((s) => ({ id: s.id, name: s.name }))}
        ranking={rankingRows}
      />
    </div>
  );
}
