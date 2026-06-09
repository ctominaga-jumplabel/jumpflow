import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { TimesheetWeekView } from "@/components/timesheet/TimesheetWeekView";

export const metadata: Metadata = { title: "Horas" };

export default function HorasPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operação"
        title="Horas"
        description="Lançamento semanal por projeto e atividade, com envio para aprovação."
      />
      <TimesheetWeekView />
    </div>
  );
}
