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

import { devLogin, loginWithEntra } from "./actions";

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
