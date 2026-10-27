import { pathToFileURL } from "node:url";

/**
 * Alinha a NOMENCLATURA do catálogo de funcionalidades da Matriz de Permissões
 * às telas reais do JumpFlow (rótulos do menu, abas e seções de cada tela) e
 * agrupa os módulos como o menu lateral (Projetos & Clientes, Operação,
 * Relatórios & Análises, Administração…).
 *
 * POR QUE ESTE SCRIPT EXISTE, e não `npm run db:seed`:
 * o seed reescreve TODAS as células RolePermission para os defaults, apagando
 * os ajustes feitos pelo ADMIN em /app/admin/permissoes (mesma razão de
 * `grant-coe-permission.mjs`).
 *
 * Este script toca EXCLUSIVAMENTE as colunas `name`, `module`, `parentId` e
 * `sortOrder` das linhas `Permission` cujos codes estão abaixo (as nativas).
 * NÃO cria permissões, NÃO altera `code`/`active`/`description` e NÃO lê nem
 * escreve nenhuma célula RolePermission — quem pode o quê fica intacto.
 * Funcionalidades criadas pelo ADMIN (codes fora da lista) não são tocadas.
 *
 * Idempotente: rodar de novo não muda mais nada. Use `--dry-run` para só listar.
 *
 * Uso (com DATABASE_URL/DIRECT_URL do ambiente alvo):
 *   node packages/database/prisma/align-permission-catalog.mjs [--dry-run]
 *
 * Mantido em sincronia com PERMISSION_CATALOG (seed.mjs) por
 * apps/web/src/lib/auth/permission-catalog-alignment.test.ts.
 */

export const PERMISSION_CATALOG_ALIGNMENT = [
  { code: "DASHBOARD", name: "Dashboard", module: "Relatórios & Análises", parent: null, sortOrder: 0 },
  { code: "HORAS", name: "Horas", module: "Horas", parent: null, sortOrder: 10 },
  { code: "HORAS_LANCAMENTOS", name: "Novo lançamento", module: "Horas", parent: "HORAS", sortOrder: 11 },
  { code: "HORAS_APROVACOES", name: "Aprovações de horas", module: "Horas", parent: "HORAS", sortOrder: 12 },
  { code: "HORAS_RELATORIOS", name: "Horas", module: "Relatórios & Análises", parent: "RELATORIOS", sortOrder: 101 },
  { code: "DESPESAS", name: "Despesas", module: "Despesas", parent: null, sortOrder: 20 },
  { code: "DESPESAS_PAGAMENTO", name: "Status de pagamento", module: "Despesas", parent: "DESPESAS", sortOrder: 21 },
  { code: "SOBREAVISO", name: "Sobreaviso", module: "Horas", parent: "HORAS", sortOrder: 14 },
  { code: "AUSENCIAS", name: "Ausências", module: "Operação", parent: null, sortOrder: 23 },
  { code: "OPERACAO_FECHAMENTO", name: "Fechamento Operacional", module: "Operação", parent: null, sortOrder: 24 },
  { code: "PROJETOS", name: "Projetos", module: "Projetos & Clientes", parent: null, sortOrder: 30 },
  { code: "PROJETOS_CADASTRO", name: "Cadastro", module: "Projetos & Clientes", parent: "PROJETOS", sortOrder: 31 },
  { code: "PROJETOS_EQUIPES", name: "Vínculos", module: "Projetos & Clientes", parent: "PROJETOS", sortOrder: 32 },
  { code: "PROJETOS_FINANCEIRO", name: "Valores de venda", module: "Projetos & Clientes", parent: "PROJETOS", sortOrder: 33 },
  { code: "PROJETOS_RELATORIOS", name: "Acompanhamento", module: "Projetos & Clientes", parent: "PROJETOS", sortOrder: 34 },
  { code: "CLIENTES", name: "Clientes", module: "Projetos & Clientes", parent: null, sortOrder: 40 },
  { code: "COMERCIAL", name: "Comercial", module: "Projetos & Clientes", parent: null, sortOrder: 50 },
  { code: "CONSULTORES", name: "Consultores", module: "Pessoas", parent: null, sortOrder: 60 },
  { code: "CONSULTORES_PESSOAIS", name: "Informações pessoais", module: "Pessoas", parent: "CONSULTORES", sortOrder: 60 },
  { code: "CONSULTORES_DOCUMENTOS", name: "Documentações", module: "Pessoas", parent: "CONSULTORES", sortOrder: 60 },
  { code: "CONSULTORES_CURRICULO", name: "Currículo", module: "Pessoas", parent: "CONSULTORES", sortOrder: 60 },
  { code: "CONSULTORES_BANCARIAS", name: "Contas bancárias", module: "Pessoas", parent: "CONSULTORES", sortOrder: 60 },
  { code: "CONSULTORES_REMUNERACAO", name: "Valores e remuneração", module: "Pessoas", parent: "CONSULTORES", sortOrder: 60 },
  { code: "SKILLS", name: "Skills", module: "Pessoas", parent: null, sortOrder: 61 },
  { code: "COMPETENCIAS", name: "Competências", module: "Pessoas", parent: null, sortOrder: 62 },
  { code: "DISPONIBILIDADE", name: "Disponibilidade", module: "Pessoas", parent: null, sortOrder: 63 },
  { code: "CERTIFICADOS", name: "Certificados", module: "Pessoas", parent: null, sortOrder: 64 },
  { code: "CHECKPOINT", name: "Checkpoints", module: "Pessoas", parent: null, sortOrder: 65 },
  { code: "OPPORTUNITY", name: "Oportunidades", module: "Pessoas", parent: "CHECKPOINT", sortOrder: 66 },
  { code: "CASE", name: "Cases", module: "Pessoas", parent: "CHECKPOINT", sortOrder: 67 },
  { code: "FEEDBACK", name: "Feedback", module: "Desenvolvimento", parent: null, sortOrder: 70 },
  { code: "AVALIACOES", name: "Avaliações", module: "Desenvolvimento", parent: null, sortOrder: 71 },
  { code: "PDI", name: "PDI", module: "Desenvolvimento", parent: null, sortOrder: 72 },
  { code: "CLIMA", name: "Clima", module: "Desenvolvimento", parent: null, sortOrder: 73 },
  { code: "METAS", name: "Metas", module: "Desenvolvimento", parent: null, sortOrder: 74 },
  { code: "UNIVERSIDADE", name: "JumpAcademy", module: "Desenvolvimento", parent: null, sortOrder: 75 },
  { code: "ALOCACAO_IA", name: "IA de Alocação", module: "Relatórios & Análises", parent: null, sortOrder: 80 },
  { code: "RISCO_PROJETOS", name: "Risco de Projetos", module: "Relatórios & Análises", parent: null, sortOrder: 81 },
  { code: "SCORE_CONSULTOR", name: "Score", module: "Relatórios & Análises", parent: null, sortOrder: 82 },
  { code: "COE", name: "Painel COE", module: "Inteligência", parent: null, sortOrder: 83 },
  { code: "FEED", name: "Feed", module: "Comunicação", parent: null, sortOrder: 85 },
  { code: "APROVACOES", name: "Aprovações", module: "Operação", parent: null, sortOrder: 90 },
  { code: "AUTOMACOES", name: "Regras de aprovação automática", module: "Administração", parent: null, sortOrder: 124 },
  { code: "RELATORIOS", name: "Relatórios", module: "Relatórios & Análises", parent: null, sortOrder: 100 },
  { code: "RELATORIOS_CONSULTORES", name: "Filtro por consultor", module: "Relatórios & Análises", parent: "RELATORIOS", sortOrder: 104 },
  { code: "FINANCEIRO", name: "Financeiro", module: "Financeiro", parent: null, sortOrder: 110 },
  { code: "FINANCEIRO_COBRANCA", name: "Cobrança de projetos", module: "Financeiro", parent: "FINANCEIRO", sortOrder: 111 },
  { code: "FINANCEIRO_FECHAMENTO", name: "Fechamento mensal", module: "Financeiro", parent: "FINANCEIRO", sortOrder: 112 },
  { code: "PAGAMENTOS", name: "Pagamentos", module: "Financeiro", parent: null, sortOrder: 113 },
  { code: "ADMIN_ACESSOS", name: "Acessos", module: "Administração", parent: null, sortOrder: 120 },
  { code: "CONFIGURACOES_PERMISSOES", name: "Matriz de Permissões", module: "Administração", parent: null, sortOrder: 121 },
  { code: "CONFIGURACOES_NOTIFICACOES", name: "Regras de Notificação", module: "Administração", parent: null, sortOrder: 122 },
  { code: "CONFIGURACOES_FERIADOS", name: "Feriados", module: "Administração", parent: null, sortOrder: 123 },
  { code: "MINHAS_NOTAS", name: "Minhas Notas", module: "Despesas", parent: null, sortOrder: 25 },
  { code: "DESPESAS_POLITICA", name: "Política de Reembolso", module: "Despesas", parent: "DESPESAS", sortOrder: 22 },
  { code: "OPERACAO_COCKPIT", name: "Cockpit do Gestor", module: "Operação", parent: null, sortOrder: 25 },
  { code: "OPERACAO_FECHAMENTO_DETALHAMENTO", name: "Detalhamento por consultor", module: "Operação", parent: "OPERACAO_FECHAMENTO", sortOrder: 26 },
  { code: "PROJETOS_SKILLS", name: "Skills", module: "Projetos & Clientes", parent: "PROJETOS", sortOrder: 35 },
  { code: "PROJETOS_APROVACAO", name: "Aprovação", module: "Projetos & Clientes", parent: "PROJETOS", sortOrder: 36 },
  { code: "PROJETOS_RECEBIMENTOS", name: "Recebimentos previstos", module: "Projetos & Clientes", parent: "PROJETOS", sortOrder: 37 },
  { code: "PROJETOS_COBRANCA", name: "Cobrança", module: "Projetos & Clientes", parent: "PROJETOS", sortOrder: 38 },
  { code: "CLIENTES_TIPOS_COBRANCA", name: "Tipos de cobrança", module: "Projetos & Clientes", parent: "CLIENTES", sortOrder: 41 },
  { code: "PAINEL_TALENTOS", name: "Painel de Talentos", module: "Pessoas", parent: null, sortOrder: 61 },
  { code: "PAINEL_TALENTOS_TALENT_FINDER", name: "Talent Finder", module: "Pessoas", parent: "PAINEL_TALENTOS", sortOrder: 61 },
  { code: "PAINEL_TALENTOS_SKILLS", name: "Skills", module: "Pessoas", parent: "PAINEL_TALENTOS", sortOrder: 62 },
  { code: "PAINEL_TALENTOS_CERTIFICACOES", name: "Certificações", module: "Pessoas", parent: "PAINEL_TALENTOS", sortOrder: 63 },
  { code: "PAINEL_TALENTOS_CONSULTORES", name: "Consultores", module: "Pessoas", parent: "PAINEL_TALENTOS", sortOrder: 64 },
  { code: "PAINEL_TALENTOS_MATRIZ_SKILLS", name: "Matriz de Skills", module: "Pessoas", parent: "PAINEL_TALENTOS", sortOrder: 65 },
  { code: "PAINEL_TALENTOS_INATIVOS", name: "Banco de Inativos", module: "Pessoas", parent: "PAINEL_TALENTOS", sortOrder: 66 },
  { code: "PAINEL_TALENTOS_GOVERNANCA", name: "Governança", module: "Pessoas", parent: "PAINEL_TALENTOS", sortOrder: 67 },
  { code: "SKILLS_CURRICULO", name: "Meu Currículo", module: "Pessoas", parent: "SKILLS", sortOrder: 62 },
  { code: "SKILLS_CATALOGO", name: "Catálogo", module: "Pessoas", parent: "SKILLS", sortOrder: 63 },
  { code: "COE_COMPOSICAO", name: "Composição de time", module: "Inteligência", parent: "COE", sortOrder: 84 },
  { code: "COE_PROPOSTAS", name: "Propostas salvas", module: "Inteligência", parent: "COE", sortOrder: 85 },
  { code: "COE_CURADORIA", name: "Curadoria", module: "Inteligência", parent: "COE", sortOrder: 86 },
  { code: "RELATORIOS_DESPESAS", name: "Despesas", module: "Relatórios & Análises", parent: "RELATORIOS", sortOrder: 102 },
  { code: "RELATORIOS_CONSOLIDADO", name: "Consolidado", module: "Relatórios & Análises", parent: "RELATORIOS", sortOrder: 103 },
  { code: "FINANCEIRO_CONTAS_RECEBER", name: "Contas a Receber", module: "Financeiro", parent: "FINANCEIRO", sortOrder: 110 },
  { code: "FINANCEIRO_CONTAS_PAGAR", name: "Contas a Pagar", module: "Financeiro", parent: "FINANCEIRO", sortOrder: 111 },
  { code: "FINANCEIRO_STATUS_FATURAMENTO", name: "Status de Faturamento", module: "Financeiro", parent: "FINANCEIRO", sortOrder: 112 },
  { code: "CONFIGURACOES_MENU", name: "Ordem do Menu", module: "Administração", parent: null, sortOrder: 125 },
  // Fluxo de Horas: governança + SLA (migração 20261027120000).
  { code: "FATURAMENTO_REABRIR_LIBERACAO", name: "Reabrir faturamento liberado", module: "Financeiro", parent: "FINANCEIRO", sortOrder: 113 },
  { code: "PAGAMENTOS_LIBERACAO_DP", name: "Liberar pagamento (DP)", module: "Financeiro", parent: "PAGAMENTOS", sortOrder: 114 },
  { code: "PAGAMENTOS_ENVIO_NF", name: "Enviar solicitação de NF", module: "Financeiro", parent: "PAGAMENTOS", sortOrder: 115 },
  { code: "PAGAMENTOS_REABRIR_LIBERACAO", name: "Reabrir liberação de pagamento", module: "Financeiro", parent: "PAGAMENTOS", sortOrder: 116 },
  { code: "CONFIGURACOES_TEMPLATES_EMAIL", name: "Templates de e-mail", module: "Administração", parent: null, sortOrder: 126 },
  { code: "SLA_ACOMPANHAMENTO", name: "Acompanhamento de SLA", module: "Operação", parent: null, sortOrder: 27 },
  { code: "SLA_CONFIGURACAO", name: "Configurar prazos de SLA", module: "Operação", parent: "SLA_ACOMPANHAMENTO", sortOrder: 28 },
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const codes = PERMISSION_CATALOG_ALIGNMENT.map((p) => p.code);
    const rows = await prisma.permission.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, name: true, module: true, parentId: true, sortOrder: true },
    });
    const byCode = new Map(rows.map((r) => [r.code, r]));

    let changed = 0;
    for (const target of PERMISSION_CATALOG_ALIGNMENT) {
      const row = byCode.get(target.code);
      if (!row) {
        console.warn(`- ${target.code}: não existe neste banco (ignorado; não criamos permissões aqui).`);
        continue;
      }
      // Sem pai no catálogo → tela principal (desfaz reparent manual de nativa).
      // Pai ausente no banco: mantém o parentId atual em vez de inventar.
      const parentId = target.parent
        ? (byCode.get(target.parent)?.id ?? row.parentId)
        : null;
      const data = {
        name: target.name,
        module: target.module,
        parentId,
        sortOrder: target.sortOrder,
      };
      const diff = Object.entries(data).filter(([k, v]) => row[k] !== v);
      if (diff.length === 0) continue;
      changed += 1;
      console.log(
        `${dryRun ? "[dry-run] " : ""}${target.code}: ` +
          diff.map(([k, v]) => `${k} ${JSON.stringify(row[k])} → ${JSON.stringify(v)}`).join("; "),
      );
      if (!dryRun) {
        await prisma.permission.update({ where: { id: row.id }, data });
      }
    }
    console.log(
      `${changed} funcionalidade(s) ${dryRun ? "a alinhar" : "alinhada(s)"}; ` +
        `${PERMISSION_CATALOG_ALIGNMENT.length - changed} já estavam alinhadas ou ausentes.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Só executa quando chamado direto (o teste importa a lista sem tocar o banco).
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error("align-permission-catalog failed:", error);
    process.exit(1);
  });
}
