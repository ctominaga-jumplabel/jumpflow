import { afterEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((path: string) => {
  // Mirror Next.js: redirect() throws internally to halt execution.
  throw new Error(`NEXT_REDIRECT:${path}`);
});
const signInMock = vi.fn();
const cookieDeleteMock = vi.fn();

vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ delete: cookieDeleteMock, set: vi.fn() }),
}));
vi.mock("@/auth", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
  signOut: vi.fn(),
}));

// Real-ish AuthError so `instanceof` works in loginWithCredentials. Defined
// inside the factory because vi.mock is hoisted above module-level consts.
vi.mock("next-auth", () => {
  class FakeAuthError extends Error {
    type = "CredentialsSignin";
  }
  return { AuthError: FakeAuthError };
});

import { AuthError } from "next-auth";
import { CREDENTIALS_ERROR_MESSAGE } from "./messages";
import { devLogin, loginWithCredentials, loginWithEntra } from "./actions";
const FakeAuthError = AuthError as unknown as new (msg?: string) => Error;

/** Build a FormData with email/password for the credentials action. */
function form(email: string, password: string): FormData {
  const fd = new FormData();
  fd.set("email", email);
  fd.set("password", password);
  return fd;
}

afterEach(() => {
  vi.clearAllMocks();
});

/** Run the action and swallow the redirect "throw" so targets can be asserted. */
async function run(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("NEXT_REDIRECT:")) {
      throw error;
    }
  }
}

describe("login actions — callbackUrl revalidation on the server", () => {
  it("devLogin defaults to the launcher and preserves a valid callbackUrl", async () => {
    await run(() => devLogin("/app/despesas"));
    expect(redirectMock).toHaveBeenCalledWith("/app/despesas");

    await run(() => devLogin(""));
    expect(redirectMock).toHaveBeenLastCalledWith("/app");
  });

  it("devLogin blocks an unsafe bound callbackUrl (forged POST)", async () => {
    await run(() => devLogin("https://evil.com"));
    expect(redirectMock).toHaveBeenLastCalledWith("/app");

    await run(() => devLogin("//evil.com"));
    expect(redirectMock).toHaveBeenLastCalledWith("/app");
  });

  it("loginWithEntra revalidates the redirectTo passed to the provider", async () => {
    await run(() => loginWithEntra("/app/horas"));
    expect(signInMock).toHaveBeenCalledWith("microsoft-entra-id", {
      redirectTo: "/app/horas",
    });

    await run(() => loginWithEntra("https://evil.com"));
    expect(signInMock).toHaveBeenLastCalledWith("microsoft-entra-id", {
      redirectTo: "/app",
    });
  });
});

describe("loginWithCredentials — generic errors and safe redirect", () => {
  it("calls signIn('credentials') with a revalidated redirectTo", async () => {
    // On success signIn throws NEXT_REDIRECT; simulate that and ensure it
    // propagates (the navigation must happen, not be swallowed).
    signInMock.mockImplementationOnce(() => {
      const err = new Error("redirect") as Error & { digest: string };
      err.digest = "NEXT_REDIRECT;replace;/app/horas;307;";
      throw err;
    });

    await expect(
      loginWithCredentials("/app/horas", {}, form("a@b.com", "secret")),
    ).rejects.toMatchObject({ digest: expect.stringContaining("NEXT_REDIRECT") });

    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "a@b.com",
      password: "secret",
      redirectTo: "/app/horas",
    });
  });

  it("blocks an unsafe bound callbackUrl", async () => {
    signInMock.mockImplementationOnce(() => {
      const err = new Error("redirect") as Error & { digest: string };
      err.digest = "NEXT_REDIRECT;replace;/app;307;";
      throw err;
    });

    await expect(
      loginWithCredentials("https://evil.com", {}, form("a@b.com", "secret")),
    ).rejects.toBeTruthy();

    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "a@b.com",
      password: "secret",
      redirectTo: "/app",
    });
  });

  it("maps any AuthError to ONE generic message (no existence/state leak)", async () => {
    signInMock.mockImplementationOnce(() => {
      throw new FakeAuthError("CredentialsSignin");
    });

    await expect(
      loginWithCredentials("/app", {}, form("a@b.com", "wrong")),
    ).resolves.toEqual({ error: CREDENTIALS_ERROR_MESSAGE });
  });

  it("rethrows non-auth, non-redirect errors", async () => {
    signInMock.mockImplementationOnce(() => {
      throw new Error("database down");
    });

    await expect(
      loginWithCredentials("/app", {}, form("a@b.com", "x")),
    ).rejects.toThrow("database down");
  });
});
