import { afterEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
const redirectMock = vi.fn((path: string) => {
  // Mirror Next.js: redirect() throws internally to halt rendering.
  throw new Error(`NEXT_REDIRECT:${path}`);
});

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirectMock(path),
}));

import Home from "./page";
import { DEV_USER } from "@/lib/auth/dev";

afterEach(() => {
  vi.clearAllMocks();
});

/** Invoke the RSC and swallow the redirect "throw" so we can assert the target. */
async function runHome(): Promise<void> {
  try {
    await Home();
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("NEXT_REDIRECT:")) {
      throw error;
    }
  }
}

describe("/ (Home) — internal entrypoint redirect", () => {
  it("sends authenticated users to the launcher", async () => {
    getCurrentUserMock.mockResolvedValue(DEV_USER);

    await runHome();

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/app");
  });

  it("sends unauthenticated users to login", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    await runHome();

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("falls back to login when auth resolution throws (e.g. misconfigured env)", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("MissingSecret"));

    await runHome();

    expect(redirectMock).toHaveBeenCalledTimes(1);
    expect(redirectMock).toHaveBeenCalledWith("/login");
  });
});
