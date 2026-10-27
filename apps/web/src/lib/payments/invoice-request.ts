/**
 * Quebra por projeto da solicitação de NF ao consultor (reunião Fluxo de
 * Horas). Hoje é REFERÊNCIA no e-mail: o pedido segue sendo de UMA NF com o
 * valor previsto total, porque o pagamento guarda um único `invoiceAmount` e
 * os anexos não têm valor/projeto próprios (NF por projeto exigiria schema).
 * Puro (sem Prisma) para ser testável.
 *
 * Fonte de verdade:
 * - Projetos/horas: linhas "Horas aprovadas" do ConsultantPayment (uma por
 *   projeto, geradas a partir das horas APROVADAS do mês). Linhas de benefício
 *   (sem projeto) e de remuneração pontual NÃO entram — a NF de serviço cobre a
 *   parte PJ (`pjAmount`), que é o valor previsto já informado no e-mail.
 * - Valor por projeto: o valor da própria linha quando as linhas somam o valor
 *   previsto (PJ por hora / valor-hora por projeto). Quando NÃO somam (PJ com
 *   valor fixo mensal, em que a linha não carrega o valor real), o valor
 *   previsto é RATEADO pelas horas de cada projeto (`proportional = true`),
 *   com o resto de arredondamento no último projeto — a soma bate sempre com o
 *   valor previsto.
 */

export interface InvoiceRequestSourceLine {
  projectId: string | null;
  projectName: string | null;
  clientName: string | null;
  description: string;
  hours: number;
  amount: number;
}

export interface InvoiceRequestProjectRow {
  projectName: string;
  clientName: string;
  hours: number;
  amount: number;
}

export interface InvoiceRequestBreakdown {
  projects: InvoiceRequestProjectRow[];
  /** true quando o valor por projeto foi rateado pelas horas. */
  proportional: boolean;
}

/** Prefixo das linhas de remuneração pontual (ver lib/db/payments). */
const AD_HOC_LINE_PREFIX = "Remuneracao pontual";
/** Tolerância de centavos para considerar que as linhas fecham o previsto. */
const MATCH_TOLERANCE = 0.05;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildInvoiceProjectBreakdown(
  lines: InvoiceRequestSourceLine[],
  expectedAmount: number,
): InvoiceRequestBreakdown {
  const byProject = new Map<string, InvoiceRequestProjectRow>();
  for (const line of lines) {
    if (!line.projectId) continue;
    if (line.description.startsWith(AD_HOC_LINE_PREFIX)) continue;
    const current = byProject.get(line.projectId) ?? {
      projectName: line.projectName ?? "Projeto",
      clientName: line.clientName ?? "—",
      hours: 0,
      amount: 0,
    };
    current.hours += line.hours;
    current.amount += line.amount;
    byProject.set(line.projectId, current);
  }
  const projects = [...byProject.values()]
    .map((row) => ({ ...row, hours: round2(row.hours), amount: round2(row.amount) }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName, "pt-BR"));
  if (projects.length === 0) return { projects, proportional: false };

  const linesTotal = projects.reduce((sum, row) => sum + row.amount, 0);
  if (Math.abs(linesTotal - expectedAmount) <= MATCH_TOLERANCE) {
    return { projects, proportional: false };
  }

  // Rateio pelas horas (PJ fixo): soma exata = valor previsto.
  const totalHours = projects.reduce((sum, row) => sum + row.hours, 0);
  if (totalHours <= 0) {
    // Sem horas não há base de rateio: divide igualmente.
    const share = round2(expectedAmount / projects.length);
    let allocated = 0;
    return {
      proportional: true,
      projects: projects.map((row, index) => {
        const amount =
          index === projects.length - 1
            ? round2(expectedAmount - allocated)
            : share;
        allocated += amount;
        return { ...row, amount };
      }),
    };
  }
  let allocated = 0;
  return {
    proportional: true,
    projects: projects.map((row, index) => {
      const amount =
        index === projects.length - 1
          ? round2(expectedAmount - allocated)
          : round2((expectedAmount * row.hours) / totalHours);
      allocated += amount;
      return { ...row, amount };
    }),
  };
}
