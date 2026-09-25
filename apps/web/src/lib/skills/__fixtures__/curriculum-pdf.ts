/**
 * Gera um PDF de currículo VÁLIDO em memória, sem dependência externa e sem
 * binário versionado no repo.
 *
 * Existe para o teste de integração da leitura por IA: o provider recebe o PDF
 * como `inline_data`/`document` base64, então precisamos de bytes de PDF de
 * verdade (com xref correto), não de um texto qualquer. Mantenha o conteúdo em
 * ASCII — o PDF usa Helvetica/WinAnsi e a fonte não traz acentuação garantida.
 */

/** Escapa os caracteres que um literal string de PDF trata como sintaxe. */
function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, "\\$1");
}

/**
 * Monta um PDF de uma página com as linhas dadas, calculando os offsets da
 * tabela xref (um offset errado torna o arquivo ilegível para muitos parsers).
 */
export function buildCurriculumPdf(lines: string[]): Buffer {
  const content =
    "BT\n/F1 11 Tf\n50 800 Td\n14 TL\n" +
    lines.map((line) => `(${escapePdfText(line)}) Tj T*\n`).join("") +
    "ET\n";

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf +=
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

/** Currículo de exemplo com skills, certificados e cases explícitos. */
export const SAMPLE_CURRICULUM_LINES = [
  "Bia Souza",
  "Engenheira de Dados Senior",
  "Sao Paulo, SP",
  "",
  "RESUMO",
  "Engenheira de dados com foco em plataformas analiticas e pipelines em nuvem.",
  "",
  "EXPERIENCIA PROFISSIONAL",
  "Jump Label - Consultora de Dados - 01/2024 ate o momento",
  "Responsavel por pipelines de dados e modelagem analitica.",
  "Acme Corp - Analista de Dados - 03/2021 a 12/2023",
  "Construiu a camada de dados do time de marketing.",
  "",
  "COMPETENCIAS",
  "Python, SQL, Apache Airflow, dbt, AWS, Terraform",
  "",
  "CERTIFICACOES",
  "AWS Certified Solutions Architect - Associate - Amazon Web Services - emitido em 10/03/2025, valido ate 10/03/2028",
  "dbt Analytics Engineering Certification - dbt Labs - emitido em 15/07/2024",
  "",
  "PROJETOS E RESULTADOS",
  "Migracao do data warehouse on-premise para a nuvem: liderou a migracao de 40 TB,",
  "concluida em 2024, reduzindo o custo mensal de infraestrutura em 35 por cento.",
  "Plataforma de self-service analytics: entregou catalogo de dados e camada semantica,",
  "reduzindo em 60 por cento os pedidos manuais de relatorio.",
];
