import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Machine-to-machine (M2M) guard for the CRM → JumpFlow ingestion endpoint.
 *
 * This endpoint lives OUTSIDE `/app/*`, so it is NOT covered by `proxy.ts` —
 * the guard here is the only gate (contrato v1 §1, guarda G6).
 *
 * PRIMARY method (no Azure required): a shared secret in the
 * `Authorization: Bearer <secret>` header, compared in constant time — the same
 * pattern as `CRON_SECRET`/`job-auth.ts`. This is the production method now, so
 * the CRM does not need MSAL/Entra at all. The secret IS the credential, so
 * there is no role/scope check on this path. Rely on HTTPS in transit.
 *
 * The OAuth/Entra resource-server path is kept as an ALTERNATIVE (future use);
 * see `docs/integracao-crm-m2m-auth.md`.
 *
 * Environment variables:
 * - `CRM_M2M_SHARED_SECRET`     PRIMARY. Shared Bearer secret the CRM sends.
 *                               Works in ALL environments, including production.
 *                               Same value set here (Vercel) and in the CRM.
 *                               Generate with `openssl rand -base64 48`.
 * - `CRM_M2M_ISSUER`            (Entra alt.) OIDC issuer to validate `iss`.
 *                               Falls back to `AUTH_MICROSOFT_ENTRA_ID_ISSUER`,
 *                               or is derived from `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`
 *                               (`https://login.microsoftonline.com/<tenant>/v2.0`).
 * - `CRM_M2M_JWKS_URI`          (Entra alt.) Optional explicit JWKS endpoint.
 *                               Defaults to `<issuer>/discovery/v2.0/keys`.
 * - `CRM_M2M_AUDIENCE`          (Entra alt.) Expected token `aud`.
 * - `CRM_M2M_REQUIRED_ROLE`     (Entra alt.) App role (`roles`) or scope (`scp`)
 *                               the token MUST carry. REQUIRED in production on
 *                               the Entra path (else any tenant token with the
 *                               right `aud` would pass ⇒ treated as
 *                               misconfiguration and DENIED). Optional non-prod.
 * - `CRM_M2M_DEV_SECRET`        Dev-only shared secret; honored ONLY when
 *                               `NODE_ENV !== "production"` (ignored in prod).
 *
 * Security posture (consistent with `job-auth.ts`, "never a silent open
 * endpoint in production"):
 * - Production NEVER opens without a credential. A configured environment
 *   (shared secret and/or Entra) never opens silently even in non-production
 *   when the bearer is wrong ⇒ 401.
 * - Only when NOTHING is configured AND `NODE_ENV !== "production"` does the
 *   guard allow (local convenience, `clientId: "dev-open"`).
 */

export type CrmM2MAuthResult =
  | { ok: true; clientId?: string }
  | { ok: false; status: 401 | 403; error: string };

function envTrimmed(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/** Resolve the OIDC issuer from dedicated env or the existing Entra config. */
function resolveIssuer(): string | undefined {
  const direct =
    envTrimmed("CRM_M2M_ISSUER") ?? envTrimmed("AUTH_MICROSOFT_ENTRA_ID_ISSUER");
  if (direct) return direct;
  const tenant = envTrimmed("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID");
  if (tenant) return `https://login.microsoftonline.com/${tenant}/v2.0`;
  return undefined;
}

function resolveJwksUri(issuer: string): string {
  const explicit = envTrimmed("CRM_M2M_JWKS_URI");
  if (explicit) return explicit;
  // Entra v2.0 JWKS discovery endpoint derived from the issuer.
  return `${issuer.replace(/\/+$/, "")}/discovery/v2.0/keys`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Extract the raw bearer token from the Authorization header, if present. */
function readBearer(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/** Whether the token carries the required app role/scope. */
function hasRequiredRole(
  payload: Record<string, unknown>,
  requiredRole: string,
): boolean {
  const roles = payload.roles;
  if (Array.isArray(roles) && roles.includes(requiredRole)) return true;
  // `scp` is a space-delimited string of scopes.
  const scp = payload.scp;
  if (typeof scp === "string" && scp.split(/\s+/).includes(requiredRole)) {
    return true;
  }
  return false;
}

// Cache the remote key set per JWKS URI (avoids refetching JWKS per request).
let jwksCache: {
  uri: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
} | null = null;

function getJwks(uri: string): ReturnType<typeof createRemoteJWKSet> {
  if (!jwksCache || jwksCache.uri !== uri) {
    jwksCache = { uri, jwks: createRemoteJWKSet(new URL(uri)) };
  }
  return jwksCache.jwks;
}

export async function authorizeCrmM2M(
  request: Request,
): Promise<CrmM2MAuthResult> {
  const sharedSecret = envTrimmed("CRM_M2M_SHARED_SECRET");
  const issuer = resolveIssuer();
  const audience = envTrimmed("CRM_M2M_AUDIENCE");
  const requiredRole = envTrimmed("CRM_M2M_REQUIRED_ROLE");
  const devSecret = envTrimmed("CRM_M2M_DEV_SECRET");
  const isProduction = process.env.NODE_ENV === "production";
  const entraConfigured = Boolean(issuer && audience);
  const configured = entraConfigured || Boolean(sharedSecret);

  const bearer = readBearer(request);

  // 1) PRIMARY: shared secret (mirrors job-auth.ts). Constant-time compare.
  // Works in ALL environments, INCLUDING production — this is the production
  // method now. The secret is the credential; no role check on this path.
  if (sharedSecret && bearer && safeEqual(bearer, sharedSecret)) {
    return { ok: true, clientId: "crm-shared-secret" };
  }

  // 2) Dev shared-secret fallback. Honored ONLY in non-production: in
  // production the dev secret is ignored entirely.
  if (!isProduction && devSecret && bearer && safeEqual(bearer, devSecret)) {
    return { ok: true, clientId: "crm-dev-secret" };
  }

  // 3) Alternative path: validate the Entra JWT as a resource server.
  if (entraConfigured) {
    // In production the app-role/scope is mandatory: without it, any tenant
    // token with the right `aud` would pass. Treat a missing role config as
    // misconfiguration and DENY (I2).
    if (isProduction && !requiredRole) {
      return { ok: false, status: 401, error: "m2m_auth_not_configured" };
    }

    if (!bearer) {
      return { ok: false, status: 401, error: "missing_bearer_token" };
    }
    try {
      const jwks = getJwks(resolveJwksUri(issuer!));
      const { payload } = await jwtVerify(bearer, jwks, {
        issuer,
        audience,
        // Pin the signature algorithm (defensive hardening, N7).
        algorithms: ["RS256"],
      });

      if (requiredRole && !hasRequiredRole(payload, requiredRole)) {
        return { ok: false, status: 403, error: "insufficient_scope" };
      }

      const clientId =
        typeof payload.azp === "string"
          ? payload.azp
          : typeof payload.appid === "string"
            ? payload.appid
            : undefined;
      return { ok: true, clientId };
    } catch {
      return { ok: false, status: 401, error: "invalid_token" };
    }
  }

  // 4) Nothing matched. A configured environment (shared secret and/or Entra)
  // never opens silently — deny even in non-production if the bearer was wrong
  // or absent. Production always denies without a credential.
  if (configured || isProduction) {
    return configured
      ? { ok: false, status: 401, error: "unauthorized" }
      : { ok: false, status: 401, error: "m2m_auth_not_configured" };
  }

  // Non-production convenience: no config at all ⇒ allow (as job-auth does).
  return { ok: true, clientId: "dev-open" };
}
