import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { AvailabilityHeatmap } from "@/components/availability/AvailabilityHeatmap";
import { requireRole } from "@/lib/auth/guards";
import { AVAILABILITY_READ_ROLES } from "@/lib/auth/route-permissions";
import { isDatabaseConfigured } from "@/lib/db/config";
import {
  DEFAULT_AVAILABILITY_WEEKS,
  getAvailabilityMap,
} from "@/lib/db/availability";
import { buildMockAvailabilityMap } from "@/lib/availability/mock";

export const metadata: Metadata = { title: "Disponibilidade" };

/**
 * Mapa de Disponibilidade (Talentos — Onda 0, EP11). Heatmap read-only derivado
 * de alocação + férias + status, escopado por RBAC no servidor. Sem DB, degrada
 * graciosamente para dados de demonstração (claramente rotulados).
 */
export default async function DisponibilidadePage() {
  const user = await requireRole(AVAILABILITY_READ_ROLES);
  const databaseReady = isDatabaseConfigured();

  const map = databaseReady
    ? await getAvailabilityMap(user)
    : buildMockAvailabilityMap(new Date(), DEFAULT_AVAILABILITY_WEEKS);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Talentos"
        title="Mapa de Disponibilidade"
        description="Heatmap da capacidade do time por consultor e semana, derivado de alocações ativas, férias e status. Visão de leitura para apoiar decisões de alocação."
      />
      <AvailabilityHeatmap map={map} isMock={!databaseReady} />
    </div>
  );
}
