import type { ActionResult } from "@/lib/actions/result";
import { getNfseRuntimeConfig, isNfseConfigured } from "./config";
import { SaoPauloNfseProvider } from "./sao-paulo-provider";
import type {
  NfseIssueRequest,
  NfseIssueResult,
  NfseProvider,
} from "./types";

export type {
  NfseIssueRequest,
  NfseIssueResult,
  NfseIssueServiceLine,
  NfseProvider,
} from "./types";

/**
 * Honest fallback when the provider is not configured (no endpoint/cert/IM).
 * It NEVER fabricates an emission — the fiscal document stays in DRAFT for
 * manual handling.
 */
class DisabledNfseProvider implements NfseProvider {
  async requestIssue(
    _input: NfseIssueRequest,
  ): Promise<ActionResult<NfseIssueResult>> {
    void _input;
    return {
      ok: false,
      error: "INVALID_INPUT",
      message:
        "Provider NFS-e nao configurado. O documento fiscal pode ficar em rascunho para emissao manual.",
    };
  }
}

const disabledProvider = new DisabledNfseProvider();

/**
 * Resolve the active provider. Returns the real {@link SaoPauloNfseProvider}
 * only when ALL credentials/endpoint/prestador are present; otherwise the
 * disabled provider (preserving the current rascunho/manual behavior).
 */
export function getNfseProvider(): NfseProvider {
  if (!isNfseConfigured()) return disabledProvider;
  const config = getNfseRuntimeConfig();
  if (!config) return disabledProvider;
  return new SaoPauloNfseProvider(config);
}
