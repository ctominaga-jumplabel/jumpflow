import { afterEach, describe, expect, it, vi } from "vitest";

const isDevAuthEnabledMock = vi.fn();
const isCredentialsEnabledMock = vi.fn();
const isEntraConfiguredMock = vi.fn();

vi.mock("@/lib/auth/dev", () => ({
  isDevAuthEnabled: () => isDevAuthEnabledMock(),
}));
vi.mock("@/auth.config", () => ({
  isCredentialsEnabled: () => isCredentialsEnabledMock(),
  isEntraConfigured: () => isEntraConfiguredMock(),
}));
vi.mock("@/lib/auth/actions", () => ({
  devLogin: vi.fn(),
  loginWithEntra: vi.fn(),
  loginWithCredentials: vi.fn(),
}));
// Identity LoginView so the page returns an element whose props we can read.
vi.mock("./login-view", () => ({ LoginView: () => null }));

import LoginPage from "./page";

interface ResolvedProps {
  variant: string;
  showEntra: boolean;
  hasCredentials: boolean;
}

async function resolveVariant(): Promise<ResolvedProps> {
  // LoginPage returns a <LoginView .../> element; read the resolved props from
  // the returned React element rather than rendering it.
  const element = (await LoginPage({
    searchParams: Promise.resolve({}),
  })) as { props: Record<string, unknown> };
  const props = element.props;
  return {
    variant: props.variant as string,
    showEntra: props.showEntra as boolean,
    hasCredentials: Boolean(props.credentialsAction),
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("LoginPage — variant precedence (dev > credentials > entra > unconfigured)", () => {
  it("picks dev even when credentials and entra are also available", async () => {
    isDevAuthEnabledMock.mockReturnValue(true);
    isCredentialsEnabledMock.mockReturnValue(true);
    isEntraConfiguredMock.mockReturnValue(true);
    await expect(resolveVariant()).resolves.toMatchObject({ variant: "dev" });
  });

  it("picks credentials over entra when both are configured (and shows entra too)", async () => {
    isDevAuthEnabledMock.mockReturnValue(false);
    isCredentialsEnabledMock.mockReturnValue(true);
    isEntraConfiguredMock.mockReturnValue(true);
    await expect(resolveVariant()).resolves.toMatchObject({
      variant: "credentials",
      showEntra: true,
      hasCredentials: true,
    });
  });

  it("shows credentials alone when entra is not configured", async () => {
    isDevAuthEnabledMock.mockReturnValue(false);
    isCredentialsEnabledMock.mockReturnValue(true);
    isEntraConfiguredMock.mockReturnValue(false);
    await expect(resolveVariant()).resolves.toMatchObject({
      variant: "credentials",
      showEntra: false,
    });
  });

  it("falls back to entra when credentials is disabled", async () => {
    isDevAuthEnabledMock.mockReturnValue(false);
    isCredentialsEnabledMock.mockReturnValue(false);
    isEntraConfiguredMock.mockReturnValue(true);
    await expect(resolveVariant()).resolves.toMatchObject({ variant: "entra" });
  });

  it("is unconfigured when nothing is available", async () => {
    isDevAuthEnabledMock.mockReturnValue(false);
    isCredentialsEnabledMock.mockReturnValue(false);
    isEntraConfiguredMock.mockReturnValue(false);
    await expect(resolveVariant()).resolves.toMatchObject({
      variant: "unconfigured",
    });
  });
});
