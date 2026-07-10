import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// O TimeEntryForm importa o ActivityVoiceButton (Melhoria #3), que por sua vez
// importa a server action de Horas (next-auth). Mockamos a action e mantemos a
// flag de voz desligada para isolar estes testes do form sem puxar next/server.
vi.mock("@/lib/transcription/flags", () => ({
  isTranscriptionEnabled: () => false,
}));
vi.mock("@/app/app/horas/actions", () => ({
  transcribeActivityAudio: vi.fn(),
}));

import { TimeEntryForm, type TimeEntryFormProject } from "./TimeEntryForm";
import type { WeekDay } from "@/lib/timesheet/types";

/**
 * Form-level cobertura da melhoria #2 (Sobreaviso vira Atividade): o campo Fator
 * de remuneração só aparece para ON_CALL, e o submit carrega o multiplier.
 *
 * Gotcha do AnimatePresence no jsdom: o Modal fechado pode permanecer montado.
 * Estes testes não dependem do fechamento — verificam o callback onSubmit (spy)
 * e a presença/ausência do campo enquanto o modal está aberto.
 */

const days: WeekDay[] = [
  { label: "Seg", date: "2026-06-08", weekend: false },
  { label: "Ter", date: "2026-06-09", weekend: false },
  { label: "Qua", date: "2026-06-10", weekend: false },
];

const projects: TimeEntryFormProject[] = [
  { id: "p1", name: "Atlas", clientId: "c1", clientName: "Vix" },
];

function setup(onSubmit = vi.fn()) {
  render(
    <TimeEntryForm
      open
      onClose={() => {}}
      projects={projects}
      days={days}
      onSubmit={onSubmit}
    />,
  );
  return { onSubmit };
}

const MULTIPLIER_LABEL = /Fator de remuneração/i;

describe("TimeEntryForm — Fator de remuneração (multiplier)", () => {
  it("não mostra o campo para atividade normal (WORKDAY)", () => {
    setup();
    expect(screen.queryByLabelText(MULTIPLIER_LABEL)).toBeNull();
  });

  it("mostra o campo ao selecionar Sobreaviso e desmarca Faturável por padrão", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Atividade"), {
      target: { value: "ON_CALL" },
    });
    const field = screen.getByLabelText(MULTIPLIER_LABEL) as HTMLInputElement;
    expect(field).not.toBeNull();
    // Sugere o fator usual de sobreaviso e marca como não faturável.
    expect(Number(field.value)).toBeGreaterThan(0);
    expect(Number(field.value)).toBeLessThan(1);
    expect((screen.getByLabelText("Faturável") as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it("submete o multiplier escolhido para um lançamento ON_CALL", () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Atividade"), {
      target: { value: "ON_CALL" },
    });
    fireEvent.change(screen.getByLabelText(MULTIPLIER_LABEL), {
      target: { value: "0.5" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Sobreaviso noturno" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      activity: "ON_CALL",
      multiplier: 0.5,
      billable: false,
    });
  });

  it("bloqueia o submit com fator zero (valor sem remuneração)", () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Atividade"), {
      target: { value: "ON_CALL" },
    });
    fireEvent.change(screen.getByLabelText(MULTIPLIER_LABEL), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Sobreaviso" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submete multiplier 1.00 para atividade normal", () => {
    const { onSubmit } = setup();
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Dia normal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      activity: "WORKDAY",
      multiplier: 1,
      billable: true,
    });
  });
});

describe("TimeEntryForm — Faturável oculto do consultor (Onda B)", () => {
  it("esconde o controle Faturável para consultor puro (canEditBillable=false)", () => {
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        onSubmit={vi.fn()}
        canEditBillable={false}
      />,
    );
    expect(screen.queryByLabelText("Faturável")).toBeNull();
  });

  it("mantém o controle visível para gestão (canEditBillable=true, default)", () => {
    setup();
    expect(screen.getByLabelText("Faturável")).toBeInTheDocument();
  });

  it("mesmo oculto, o valor billable (default true) segue no submit", () => {
    const onSubmit = vi.fn();
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        onSubmit={onSubmit}
        canEditBillable={false}
      />,
    );
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Dia normal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ billable: true });
  });
});

describe("TimeEntryForm — anexo opcional (melhoria #2)", () => {
  it("não mostra o campo de anexo quando storage indisponível", () => {
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        onSubmit={vi.fn()}
        attachmentsAvailable={false}
      />,
    );
    expect(screen.queryByText(/Anexar arquivo/i)).toBeNull();
  });

  it("mostra o campo de anexo quando storage disponível (modo diário)", () => {
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        onSubmit={vi.fn()}
        attachmentsAvailable
      />,
    );
    expect(screen.getByText(/Anexar arquivo/i)).toBeInTheDocument();
  });

  it("emite a intenção de upload no submit quando um arquivo é escolhido", () => {
    const onSubmit = vi.fn();
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        onSubmit={onSubmit}
        attachmentsAvailable
      />,
    );
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Com anexo" },
    });
    const file = new File(["%PDF-1.4"], "ok.pdf", { type: "application/pdf" });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    // O nome do arquivo aparece após a pré-checagem client-side.
    expect(screen.getByText("ok.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][1]).toMatchObject({
      kind: "upload",
      file,
    });
  });

  it("rejeita formato não aceito na pré-checagem client-side", () => {
    const onSubmit = vi.fn();
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        onSubmit={onSubmit}
        attachmentsAvailable
      />,
    );
    const bad = new File(["x"], "malware.exe", {
      type: "application/x-msdownload",
    });
    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [bad] } });
    expect(screen.getByRole("alert")).toHaveTextContent(/Formato não aceito/i);
    expect(screen.queryByText("malware.exe")).toBeNull();
  });
});

describe("TimeEntryForm — conflito com ausência confirmada (Onda D)", () => {
  // days[0] = 2026-06-08 (data default do form). Ausência CONFIRMED nesse dia.
  const timeOff = {
    byDate: {
      "2026-06-08": {
        timeOffId: "to1",
        kind: "VACATION" as const,
        paid: true,
        status: "CONFIRMED" as const,
      },
    },
  };

  it("bloqueia o submit de Dia Útil num dia de ausência confirmada", () => {
    const onSubmit = vi.fn();
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        timeOff={timeOff}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Tentativa em férias" },
    });
    // Alerta de bloqueio visível e botão Salvar desabilitado.
    expect(screen.getByRole("alert")).toHaveTextContent(/ausência confirmada/i);
    const save = screen.getByRole("button", { name: "Salvar" });
    expect(save).toBeDisabled();
    fireEvent.click(save);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não bloqueia quando a atividade não é Dia Útil (ex.: Férias)", () => {
    const onSubmit = vi.fn();
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        timeOff={timeOff}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Atividade"), {
      target: { value: "VACATION" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Férias" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("não bloqueia quando a ausência está apenas REQUESTED", () => {
    const onSubmit = vi.fn();
    render(
      <TimeEntryForm
        open
        onClose={() => {}}
        projects={projects}
        days={days}
        timeOff={{
          byDate: {
            "2026-06-08": {
              timeOffId: "to2",
              kind: "VACATION" as const,
              paid: true,
              status: "REQUESTED" as const,
            },
          },
        }}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.change(screen.getByLabelText("Projeto"), {
      target: { value: "p1" },
    });
    fireEvent.change(screen.getByLabelText("Descrição"), {
      target: { value: "Dia normal" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
