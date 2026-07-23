/**
 * Feature flags do módulo de Skills (server-side).
 *
 * `SKILLS_CV_AI_IMPORT_ENABLED` é o interruptor MESTRE da leitura de currículo
 * por IA (upload de PDF → extração assistida → proposta para confirmação). É uma
 * env comum (não `NEXT_PUBLIC_`), lida no servidor a cada request, de modo que
 * pode ser ligada/desligada no host (ex.: env do projeto na Vercel) SEM rebuild.
 *
 * Default OFF: só a string exata "true" liga. Qualquer outra coisa (ausente,
 * "false", "0", "") mantém a leitura por IA desligada. Além do flag, a extração
 * só roda quando há um provider de IA de fato configurado — assim, mesmo com o
 * flag ligado sem credencial, a UI degrada honestamente ("indisponível").
 *
 * A visibilidade da UI é dirigida pelo valor calculado AQUI no servidor e
 * passado como prop para o client (a page resolve por request, sem rebuild). A
 * server action de extração revalida este gate — nunca confia no cliente.
 */
import { isAiProviderConfigured } from "@/lib/ai/provider";

/** Whether the AI-assisted CV import is available (flag ON + provider present). */
export function isCurriculumAiImportEnabled(): boolean {
  return (
    process.env.SKILLS_CV_AI_IMPORT_ENABLED === "true" &&
    isAiProviderConfigured()
  );
}
