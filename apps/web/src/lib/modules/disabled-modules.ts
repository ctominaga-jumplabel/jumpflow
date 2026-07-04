import { notFound } from "next/navigation";

/**
 * Módulos desligados do produto (EP-M07) — REVERSÍVEL.
 *
 * Estes módulos foram removidos da UI/navegação para TODOS os perfis, mas os
 * dados, models (schema.prisma) e server actions permanecem intactos. Só a
 * superfície visível (menu + rota) some. Para REABILITAR um módulo, basta
 * remover o seu `permissionCode` deste conjunto — a página, as actions e o
 * item de navegação voltam a funcionar sem nenhuma outra alteração.
 *
 * ATENÇÃO: `COMPETENCIAS` (/app/competencias) é DIFERENTE de `SKILLS`
 * (/app/skills). Skills permanece ativo (tela do Consultor). Os dois
 * compartilham a tabela `Skill`, mas apenas Competências está desligado.
 *
 * Codes desligados:
 *  - COMPETENCIAS → /app/competencias
 *  - PDI          → /app/pdi
 *  - CLIMA        → /app/clima
 *  - METAS        → /app/metas
 */
export const DISABLED_MODULE_CODES: ReadonlySet<string> = new Set([
  "COMPETENCIAS",
  "PDI",
  "CLIMA",
  "METAS",
]);

/** Whether a permission code belongs to a module that is currently disabled. */
export function isModuleDisabled(code: string): boolean {
  return DISABLED_MODULE_CODES.has(code);
}

/**
 * Guard server-side para rotas de módulos desligados. Chamado no topo do
 * componente server da página (antes de qualquer fetch): quando o code está
 * desligado, retorna 404 (`notFound()`) — a rota deixa de existir para o
 * usuário, de forma reversível. Como o item some do menu, `findActiveNav` não
 * resolve mais o item e o layout não barra a rota; por isso este guard é a
 * defesa que garante que a URL direta também não renderiza o módulo.
 */
export function assertModuleEnabled(code: string): void {
  if (isModuleDisabled(code)) {
    notFound();
  }
}
