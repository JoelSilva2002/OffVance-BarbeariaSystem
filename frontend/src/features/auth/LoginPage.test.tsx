import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/testUtils";
import { authSession } from "@/lib/auth/authSession";
import { tokenStore } from "@/lib/auth/tokenStore";
import { LoginPage } from "./LoginPage";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("E-mail"), "joao@barbearia.com");
  await user.type(screen.getByLabelText("Senha"), "segredo123");
  await user.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
    authSession.set(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    authSession.set(null);
    tokenStore.clear();
  });

  it("INVALID_CREDENTIALS mostra erro no campo de senha, não no banner", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ type: "about:blank", title: "INVALID_CREDENTIALS", status: 401 }, 401)),
    );
    renderWithProviders(<LoginPage />, { route: "/login" });

    await fillAndSubmit(user);

    expect(await screen.findByText("E-mail ou senha inválidos.")).toBeInTheDocument();
    expect(screen.queryByText(/não foi possível/i)).not.toBeInTheDocument();
  });

  it("ACCOUNT_LOCKED mostra o detail do erro no banner", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { type: "about:blank", title: "ACCOUNT_LOCKED", status: 401, detail: "Conta bloqueada após tentativas." },
          401,
        ),
      ),
    );
    renderWithProviders(<LoginPage />, { route: "/login" });

    await fillAndSubmit(user);

    expect(await screen.findByText("Conta bloqueada após tentativas.")).toBeInTheDocument();
    expect(screen.queryByText("E-mail ou senha inválidos.")).not.toBeInTheDocument();
  });

  it("erro genérico da API cai no banner com o detail, ou no fallback quando não há detail", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ type: "about:blank", title: "VALIDATION", status: 400, detail: "Dados inválidos." }, 400),
      ),
    );
    renderWithProviders(<LoginPage />, { route: "/login" });
    await fillAndSubmit(user);
    expect(await screen.findByText("Dados inválidos.")).toBeInTheDocument();
  });

  it("erro genérico sem detail cai na mensagem de fallback", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ type: "about:blank", title: "VALIDATION", status: 400 }, 400)),
    );
    renderWithProviders(<LoginPage />, { route: "/login" });
    await fillAndSubmit(user);
    expect(await screen.findByText("Não foi possível entrar. Tente de novo.")).toBeInTheDocument();
  });

  it("falha de rede (fetch rejeita) mostra a mensagem de servidor inalcançável", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    renderWithProviders(<LoginPage />, { route: "/login" });
    await fillAndSubmit(user);
    expect(
      await screen.findByText("Não foi possível falar com o servidor. Verifique sua conexão."),
    ).toBeInTheDocument();
  });

  it("login bem-sucedido navega para /agenda", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ accessToken: "token-novo", refreshToken: "refresh-novo", role: "ADMIN" }, 200),
      ),
    );
    renderWithProviders(
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/agenda" element={<div>Agenda do dia</div>} />
      </Routes>,
      { route: "/login" },
    );

    await fillAndSubmit(user);

    expect(await screen.findByText("Agenda do dia")).toBeInTheDocument();
  });
});
