import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PendingList } from "@/components/dashboard/PendingList";
import { AllocationSummary } from "@/components/dashboard/AllocationSummary";
import { UpcomingClosings } from "@/components/dashboard/UpcomingClosings";
import { getCurrentUser } from "@/lib/auth/current-user";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  const firstName = user?.name.split(" ")[0] ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visão geral"
        title={firstName ? `Olá, ${firstName}` : "Visão geral"}
        description="Acompanhe pendências, capacidade do time e os próximos fechamentos do mês."
      />

      <KpiGrid />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PendingList />
        </div>
        <div className="space-y-6">
          <AllocationSummary />
          <UpcomingClosings />
        </div>
      </div>
    </div>
  );
}
