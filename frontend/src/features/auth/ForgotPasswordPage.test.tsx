import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/testUtils";
import { ForgotPasswordPage } from "./ForgotPasswordPage";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function submit(user: ReturnType<typeof userEvent.setup>, email: string) {
  await user.type(screen.getByLabelText("E-mail"), email);
  await user.click(screen.getByRole("button", { name: "Enviar link" }));
}

describe("ForgotPasswordPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mensagem de sucesso é a mesma independente da resposta do backend — anti-enumeração", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(null, 202)));
    const { container } = renderWithProviders(<ForgotPasswordPage />, { route: "/forgot-password" });

    await submit(user, "existe@barbearia.com");

    await waitFor(() =>
      expect(container.textContent).toContain(
        "Se existe@barbearia.com tiver uma conta de equipe, um link de redefinição foi enviado.",
      ),
    );
  });

  it("erro de rede também cai na mesma mensagem neutra", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { container } = renderWithProviders(<ForgotPasswordPage />, { route: "/forgot-password" });

    await submit(user, "inexistente@barbearia.com");

    await waitFor(() =>
      expect(container.textContent).toContain(
        "Se inexistente@barbearia.com tiver uma conta de equipe, um link de redefinição foi enviado.",
      ),
    );
  });
});
