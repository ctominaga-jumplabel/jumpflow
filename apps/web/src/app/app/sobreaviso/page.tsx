import { redirect } from "next/navigation";

/**
 * Melhoria #2 (Sobreaviso vira Atividade): a tela própria de Sobreaviso foi
 * descontinuada. O lançamento de sobreaviso agora é feito como uma atividade
 * (activityType ON_CALL) na tela de Horas, com fator de remuneração e anexo.
 *
 * Mantemos a rota resolvível e redirecionamos para /app/horas (menor risco que
 * remover a rota: links/bookmarks antigos continuam funcionando, sem 404). As
 * server actions, a view legada e lib/db/oncall.ts permanecem no repositório
 * porque a migração de dados do OnCallEntry para TimeEntry ainda depende deles.
 */
export default function SobreavisoPage() {
  redirect("/app/horas");
}
