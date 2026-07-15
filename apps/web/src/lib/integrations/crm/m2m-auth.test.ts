import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizeCrmM2M } from "./m2m-auth";

/**
 * M2M guard for the CRM → JumpFlow ingestion endpoint. Focus on the PRIMARY
 * shared-secret path (`CRM_M2M_SHARED_SECRET`) that works in production without
 * Azure, plus the "never open silently" posture. The Entra JWT path is not
 * exercised here (would require mocking jose) — only that the restructuring
 * keeps the shared-secret ordering and the fall-through behavior correct.
 */

const SECRET = "super-secret-value-123";

function requestWith(authorization?: string): Request {
  const headers = new Headers();
  if (authorization !== undefined) {
    headers.set("authorization", authorization);
  }
  return new Request("https://jumpflow.example/integrations/crm/projects", {
    method: "POST",
    headers,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("authorizeCrmM2M — shared secret (primary)", () => {
  it("authorizes with the correct bearer in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRM_M2M_SHARED_SECRET", SECRET);

    const result = await authorizeCrmM2M(requestWith(`Bearer ${SECRET}`));

    expect(result).toEqual({ ok: true, clientId: "crm-shared-secret" });
  });

  it("authorizes with the correct bearer in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRM_M2M_SHARED_SECRET", SECRET);

    const result = await authorizeCrmM2M(requestWith(`Bearer ${SECRET}`));

    expect(result).toEqual({ ok: true, clientId: "crm-shared-secret" });
  });

  it("denies a wrong bearer with 401 in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRM_M2M_SHARED_SECRET", SECRET);

    const result = await authorizeCrmM2M(requestWith("Bearer wrong-value"));

    expect(result).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("denies a wrong bearer with 401 in non-production (does not open when configured)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRM_M2M_SHARED_SECRET", SECRET);

    const result = await authorizeCrmM2M(requestWith("Bearer wrong-value"));

    expect(result).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("denies when the Authorization header is absent", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRM_M2M_SHARED_SECRET", SECRET);

    const result = await authorizeCrmM2M(requestWith());

    expect(result).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });
});

describe("authorizeCrmM2M — no configuration", () => {
  it("allows (dev-open) when nothing is configured in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRM_M2M_SHARED_SECRET", "");
    vi.stubEnv("CRM_M2M_DEV_SECRET", "");
    vi.stubEnv("CRM_M2M_ISSUER", "");
    vi.stubEnv("CRM_M2M_AUDIENCE", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ISSUER", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", "");

    const result = await authorizeCrmM2M(requestWith());

    expect(result).toEqual({ ok: true, clientId: "dev-open" });
  });

  it("denies (m2m_auth_not_configured) when nothing is configured in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRM_M2M_SHARED_SECRET", "");
    vi.stubEnv("CRM_M2M_DEV_SECRET", "");
    vi.stubEnv("CRM_M2M_ISSUER", "");
    vi.stubEnv("CRM_M2M_AUDIENCE", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ISSUER", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", "");

    const result = await authorizeCrmM2M(requestWith(`Bearer ${SECRET}`));

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "m2m_auth_not_configured",
    });
  });
});

describe("authorizeCrmM2M — dev secret", () => {
  it("authorizes with the dev secret in non-production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("CRM_M2M_DEV_SECRET", SECRET);

    const result = await authorizeCrmM2M(requestWith(`Bearer ${SECRET}`));

    expect(result).toEqual({ ok: true, clientId: "crm-dev-secret" });
  });

  it("ignores the dev secret in production (denies)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRM_M2M_DEV_SECRET", SECRET);
    // No shared secret and no Entra config → prod with nothing usable configured.
    vi.stubEnv("CRM_M2M_SHARED_SECRET", "");
    vi.stubEnv("CRM_M2M_ISSUER", "");
    vi.stubEnv("CRM_M2M_AUDIENCE", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_ISSUER", "");
    vi.stubEnv("AUTH_MICROSOFT_ENTRA_ID_TENANT_ID", "");

    const result = await authorizeCrmM2M(requestWith(`Bearer ${SECRET}`));

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "m2m_auth_not_configured",
    });
  });
});
