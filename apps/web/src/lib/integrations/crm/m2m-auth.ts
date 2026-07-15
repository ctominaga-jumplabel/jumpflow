import { timingSafeEqual } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Machine-to-machine (M2M) guard for the CRM → JumpFlow ingestion endpoint.
 *
 * JumpFlow acts as the OAuth 2.0 resource server: it validates the Bearer token
 * that the CRM obtains via client-credentials against Microsoft Entra ID
 * (contrato v1 §1, guarda G6). This endpoint lives OUTSIDE `/app/*`, so it is
 * NOT covered by `proxy.ts` — the guard here is the only gate.
 *
 * Environment variables:
 * - `CRM_M2M_ISSUER`            OIDC issuer to validate the token `iss` against.
 *                               Falls back to `AUTH_MICROSOFT_ENTRA_ID_ISSUER`,
 *                               or is derived from `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID`
 *                               (`https://login.microsoftonline.com/<tenant>/v2.0`).
 * - `CRM_M2M_JWKS_URI`          Optional explicit JWKS endpoint. Defaults to
 *                               `<issuer>/discovery/v2.0/keys` for Entra.
 * - `CRM_M2M_AUDIENCE`          Expected token `aud` (the resource/app id URI).
 * - `CRM_M2M_REQUIRED_ROLE`     App role (claim `roles`) or scope (claim `scp`)
 *                               the token MUST carry (e.g. `crm.ingest`).
 *                               REQUIRED in production: without it the guard
 *                               would accept any tenant token with the right
 *                               `aud`, so a missing value is treated as
 *                               misconfiguration and DENIED. Optional in
 *                               non-production (local convenience).
 * - `CRM_M2M_DEV_SECRET`        Dev-only shared secret; `Authorization: Bearer
 *                               <secret>` authorizes without Entra. Honored ONLY
 *                               when `NODE_ENV !== "production"`; in production it
 *                               is ignored entirely (the Entra JWT is the only
 *                               authorization path).
 *
 * Security posture (consistent with `job-auth.ts`, "never a silent open
 * endpoint in production"):
 * - Production: the ONLY way in is a valid Entra JWT (issuer + audience) that
 *   also carries `CRM_M2M_REQUIRED_ROLE`. Missing issuer/audience/role config
 *   ⇒ DENY 401 (`m2m_auth_not_configured`). Dev secret ⇒ ignored.
 * - Non-production WITHOUT any config ⇒ allow (local convenience). Dev secret
 *   and an optional role are honored when configured.
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
  const issuer = resolveIssuer();
  const audience = envTrimmed("CRM_M2M_AUDIENCE");
  const requiredRole = envTrimmed("CRM_M2M_REQUIRED_ROLE");
  const devSecret = envTrimmed("CRM_M2M_DEV_SECRET");
  const isProduction = process.env.NODE_ENV === "production";
  const entraConfigured = Boolean(issuer && audience);

  const bearer = readBearer(request);

  // Dev shared-secret fallback (mirrors job-auth.ts). Constant-time compare.
  // Honored ONLY in non-production: in production the dev secret is ignored so
  // the Entra JWT is the single authorization path (contradiction fix I1).
  if (!isProduction && devSecret && bearer && safeEqual(bearer, devSecret)) {
    return { ok: true, clientId: "crm-dev-secret" };
  }

  // Primary path: validate the Entra JWT as a resource server.
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

  // No Entra config. In production, never open silently.
  if (isProduction) {
    return { ok: false, status: 401, error: "m2m_auth_not_configured" };
  }

  // Non-production convenience: no config at all ⇒ allow (as job-auth does).
  return { ok: true, clientId: "dev-open" };
}
