import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiGrid } from "@/components/dashboard/KpiGrid";
import { PendingList } from "@/components/dashboard/PendingList";
import { AllocationSummary } from "@/components/dashboard/AllocationSummary";
import { UpcomingClosings } from "@/components/dashboard/UpcomingClosings";
import { mockUser } from "@/lib/mock-data/user";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Visão geral"
        title={`Olá, ${mockUser.name.split(" ")[0]}`}
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
