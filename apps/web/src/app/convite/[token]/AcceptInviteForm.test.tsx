import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

/**
 * jsdom tests for the public AcceptInviteForm. The server action and the router
 * are mocked. We assert the CLIENT-side guards (password length, confirmation
 * match) short-circuit before any network call, that a valid submit forwards
 * the token + chosen password and redirects, and that a neutral server error is
 * surfaced verbatim (the action already strips any existence/state detail).
 */

const acceptInvite = vi.fn();
const routerPush = vi.fn();

vi.mock("./actions", () => ({
  acceptInvite: (...a: unknown[]) => acceptInvite(...a),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

import { AcceptInviteForm } from "./AcceptInviteForm";

function renderForm() {
  return render(
    <AcceptInviteForm token="plain-token" email="join@jump.com" defaultName="Join" />,
  );
}

function setPasswords(password: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("Senha"), { target: { value: password } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), {
    target: { value: confirm },
  });
}

function submit() {
  // Submit the form directly so the password `minLength` constraint (noValidate
  // is set on the form, so jsdom won't block) and the component's own guards run.
  fireEvent.submit(screen.getByRole("button", { name: /ativar conta/i }).closest("form")!);
}

beforeEach(() => {
  vi.clearAllMocks();
  acceptInvite.mockResolvedValue({ ok: true, data: { ok: true } });
});

afterEach(() => vi.clearAllMocks());

describe("AcceptInviteForm — client guards", () => {
  it("does not submit when the password is shorter than 10 chars", async () => {
    renderForm();
    setPasswords("short", "short");
    submit();
    expect(acceptInvite).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/ao menos 10/i);
  });

  it("does not submit when the confirmation does not match", async () => {
    renderForm();
    setPasswords("uma-senha-bem-longa", "uma-senha-diferente");
    submit();
    expect(acceptInvite).not.toHaveBeenCalled();
    expect(await screen.findByRole("alert")).toHaveTextContent(/não conferem/i);
  });

  it("pre-fills the invited email (read-only) and the default name", () => {
    renderForm();
    const email = screen.getByLabelText("E-mail") as HTMLInputElement;
    expect(email.value).toBe("join@jump.com");
    expect(email).toHaveAttribute("readonly");
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Join");
  });
});

describe("AcceptInviteForm — submit flow", () => {
  it("forwards the token + matching password + name and redirects on success", async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Nova Pessoa" } });
    setPasswords("uma-senha-bem-longa", "uma-senha-bem-longa");
    // Wrap the submit: the action runs inside a useTransition, so the resolved
    // promise updates state outside React's event loop without this.
    await act(async () => {
      submit();
    });

    await vi.waitFor(() => expect(acceptInvite).toHaveBeenCalledTimes(1));
    expect(acceptInvite).toHaveBeenCalledWith({
      token: "plain-token",
      password: "uma-senha-bem-longa",
      name: "Nova Pessoa",
    });
    await vi.waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/login?activated=1"),
    );
  });

  it("shows the server's neutral message and does not redirect on failure", async () => {
    acceptInvite.mockResolvedValue({
      ok: false,
      error: "INVITE_INVALID",
      message: "Convite inválido ou expirado.",
    });
    renderForm();
    setPasswords("uma-senha-bem-longa", "uma-senha-bem-longa");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Convite inválido ou expirado.",
    );
    expect(routerPush).not.toHaveBeenCalled();
  });
});
