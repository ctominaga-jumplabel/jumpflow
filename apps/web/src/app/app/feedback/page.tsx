import type { Metadata } from "next";
import { MessageSquareHeart } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { FeedbackView } from "@/components/feedback/FeedbackView";
import { requireRole } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  listClientOptions,
  listFeedbackTimeline,
  listProjectOptions,
  listWritableConsultantOptions,
} from "@/lib/db/feedback";
import {
  FEEDBACK_READ_ROLES,
  canWriteFeedback,
  feedbackWriteScopeNote,
  hasBroadFeedbackScope,
} from "@/lib/feedback/visibility";
import { getFeedbackFlags } from "@/lib/feedback/flags";

export const metadata: Metadata = { title: "Feedback contínuo" };

export default async function FeedbackPage() {
  const user = await requireRole(FEEDBACK_READ_ROLES);
  const databaseReady = isDatabaseConfigured();
  const canWrite = canWriteFeedback(user.roles);
  const flags = getFeedbackFlags();

  if (!databaseReady) {
    // Degradação graciosa honesta: feedback é dado sensível persistido; sem DB
    // não há fallback silencioso para mock (LGPD §3).
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Talentos"
          title="Feedback contínuo"
          description="Histórico de feedbacks por consultor, ancorado em projetos e clientes reais."
        />
        <EmptyState
          icon={MessageSquareHeart}
          title="Banco de dados não configurado"
          description="O módulo de feedback consome dados sensíveis persistidos. Configure o banco para registrar e visualizar feedbacks."
        />
      </div>
    );
  }

  const [items, consultants, projects, clients] = await Promise.all([
    listFeedbackTimeline(user),
    canWrite ? listWritableConsultantOptions(user) : Promise.resolve([]),
    canWrite ? listProjectOptions() : Promise.resolve([]),
    canWrite ? listClientOptions() : Promise.resolve([]),
  ]);

  const isManager = hasRole(user, ["ADMIN", "PEOPLE", "AREA_MANAGER", "PROJECT_MANAGER"]);

  // Fix do "não consegui incluir": quando o escopo de escrita está vazio,
  // explicamos por quê e o que fazer, em vez de só mostrar uma lista vazia.
  const writeScopeNote = canWrite
    ? feedbackWriteScopeNote({
        broadScope: hasBroadFeedbackScope(user.roles),
        consultantCount: consultants.length,
      })
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos"
        title="Feedback contínuo"
        description="Registre e acompanhe feedbacks (elogio, orientação, reconhecimento, atenção) ancorados em projetos e clientes reais. A visibilidade controla o que o consultor enxerga."
      />
      <FeedbackView
        items={items}
        canWrite={canWrite}
        isManager={isManager}
        consultants={consultants}
        projects={projects}
        clients={clients}
        flags={flags}
        writeScopeNote={writeScopeNote}
      />
    </div>
  );
}
