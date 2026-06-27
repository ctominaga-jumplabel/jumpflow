import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Headset } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { CheckpointsView } from "@/components/checkpoints/CheckpointsView";
import { requirePermission } from "@/lib/auth/guards";
import { hasRole } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  listCheckpoints,
  listRegistrableConsultants,
} from "@/lib/db/checkpoint";
import {
  getCheckpointInsights,
  listCheckpointProjectOptions,
} from "@/lib/db/checkpoint-insights";
import { canRegisterCheckpoint } from "@/lib/checkpoint/visibility";
import {
  getCheckpointFlags,
  isCheckpointEnabled,
} from "@/lib/checkpoint/flags";
import type { CheckpointInsights } from "@/lib/checkpoint/types";

export const metadata: Metadata = { title: "Checkpoints / 1-on-1" };

/**
 * Tela de Checkpoints / 1-on-1 (Melhoria #4, FATIA 5). Server Component:
 *
 * - Gate de rota duplo: a feature flag (off → notFound, item de nav some) e a
 *   permissão CHECKPOINT.view da matriz (requirePermission → /access-denied).
 * - Carrega a timeline já escopada (RBAC/LGPD enforced no DB layer), os alvos
 *   registráveis (só gestores recebem) e as opções de projeto do composer.
 * - Insights (Opportunity/Case) só são pré-carregados para os checkpoints cujo
 *   CRU o viewer pode ver (`canViewRaw`) E quando a flag de IA está ligada — o
 *   consultor avaliado nunca recebe candidatos. Skills NÃO vêm aqui (curadoria
 *   existente em /app/skills).
 */
export default async function CheckpointsPage() {
  // Flag primeiro: quando o módulo está desligado a rota simplesmente não existe.
  if (!isCheckpointEnabled()) notFound();

  // RBAC: matriz configurável. Consultor alcança a própria timeline (só SHARED,
  // sem cru) — o escopo de linha é enforced no DB layer, não na rota.
  const user = await requirePermission("CHECKPOINT", "view");
  const flags = getCheckpointFlags();

  if (!isDatabaseConfigured()) {
    // Degradação honesta: checkpoint é dado sensível persistido; sem DB não há
    // fallback silencioso para mock (LGPD/confiança).
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Pessoas"
          title="Checkpoints / 1-on-1"
          description="Acompanhamento do consultor por 1-on-1 e checkpoints semanais por projeto."
        />
        <EmptyState
          icon={Headset}
          title="Banco de dados não configurado"
          description="O módulo de checkpoints consome dados sensíveis persistidos. Configure o banco para registrar e visualizar checkpoints."
        />
      </div>
    );
  }

  const canRegister = canRegisterCheckpoint(user.roles);

  const [items, consultants, projects] = await Promise.all([
    listCheckpoints(user),
    canRegister ? listRegistrableConsultants(user) : Promise.resolve([]),
    canRegister ? listCheckpointProjectOptions() : Promise.resolve([]),
  ]);

  // Pré-carrega os insights apenas dos checkpoints cujo cru o viewer pode ver E
  // só quando a IA está ligada. getCheckpointInsights reaplica o gate de cru,
  // então isto é otimização (evita a query) — nunca a fronteira de segurança.
  const insightsById: Record<string, CheckpointInsights> = {};
  if (flags.ai) {
    const targets = items.filter((item) => item.canViewRaw);
    const loaded = await Promise.all(
      targets.map(async (item) => ({
        id: item.id,
        insights: await getCheckpointInsights(user, item.id),
      })),
    );
    for (const entry of loaded) {
      insightsById[entry.id] = entry.insights;
    }
  }

  const isManager = hasRole(user, [
    "ADMIN",
    "PEOPLE",
    "AREA_MANAGER",
    "PROJECT_MANAGER",
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pessoas"
        title="Checkpoints / 1-on-1"
        description="Registre e acompanhe 1-on-1 e checkpoints por consultor. O 1-on-1 nasce privado: o consultor só enxerga o que for compartilhado, e nunca a transcrição ou os insights crus."
      />
      <CheckpointsView
        items={items}
        insightsById={insightsById}
        canRegister={canRegister}
        isManager={isManager}
        consultants={consultants}
        projects={projects}
        flags={flags}
      />
    </div>
  );
}
