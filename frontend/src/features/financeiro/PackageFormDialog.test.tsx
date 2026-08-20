import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/test/testUtils";
import { PackageFormDialog } from "./PackageFormDialog";
import type { Package } from "@/lib/api/packages";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function buildFetchMock(onSave: (method: string, body: unknown) => Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/packages") && (method === "POST" || method === "PATCH")) {
      return onSave(method, JSON.parse(String(init?.body ?? "{}")));
    }
    throw new Error(`fetch inesperado em: ${url} (${method})`);
  });
}

async function fillMinimalAndSubmit(user: ReturnType<typeof userEvent.setup>, price: string) {
  await user.type(screen.getByLabelText("Nome"), "Pacote Teste");
  await user.type(screen.getByLabelText("Preço (R$)"), price);
  await user.type(screen.getByLabelText("Créditos"), "5");
  await user.click(screen.getByRole("button", { name: "Salvar" }));
}

describe("PackageFormDialog — conversão de preço reais -> centavos", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('"49.90" vira priceCents: 4990', async () => {
    const user = userEvent.setup();
    let captured: { method: string; body: { priceCents: number } } | null = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock((method, body) => {
        captured = { method, body: body as { priceCents: number } };
        return jsonResponse({ id: "pkg-1" }, 201);
      }),
    );

    renderWithQueryClient(<PackageFormDialog open onOpenChange={() => {}} />);
    await fillMinimalAndSubmit(user, "49.90");

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.body.priceCents).toBe(4990);
  });

  it('"19.9" vira priceCents: 1990, não 1989 (arredondamento de ponto flutuante)', async () => {
    // Number("19.9") * 100 sem Math.round cai em 1989.9999999999998 —
    // este teste prova que o Math.round no componente cobre esse caso.
    const user = userEvent.setup();
    let captured: { method: string; body: { priceCents: number } } | null = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock((method, body) => {
        captured = { method, body: body as { priceCents: number } };
        return jsonResponse({ id: "pkg-1" }, 201);
      }),
    );

    renderWithQueryClient(<PackageFormDialog open onOpenChange={() => {}} />);
    await fillMinimalAndSubmit(user, "19.9");

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.body.priceCents).toBe(1990);
  });

  it('"10" (inteiro, sem decimal digitado) vira priceCents: 1000', async () => {
    const user = userEvent.setup();
    let captured: { method: string; body: { priceCents: number } } | null = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock((method, body) => {
        captured = { method, body: body as { priceCents: number } };
        return jsonResponse({ id: "pkg-1" }, 201);
      }),
    );

    renderWithQueryClient(<PackageFormDialog open onOpenChange={() => {}} />);
    await fillMinimalAndSubmit(user, "10");

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.body.priceCents).toBe(1000);
  });

  it("editar um pacote existente: pré-popula o preço em reais e o round-trip volta ao mesmo priceCents", async () => {
    const user = userEvent.setup();
    let captured: { method: string; body: { priceCents: number } } | null = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock((method, body) => {
        captured = { method, body: body as { priceCents: number } };
        return jsonResponse({ id: "pkg-1" }, 200);
      }),
    );

    const pkg: Package = {
      id: "pkg-1",
      name: "Pacote Corte",
      description: null,
      priceCents: 4990,
      creditsQty: 5,
      scopeServiceIds: [],
      validityDays: 90,
      isRecurring: false,
      active: true,
    };

    renderWithQueryClient(<PackageFormDialog open onOpenChange={() => {}} pkg={pkg} />);

    const priceInput = await screen.findByLabelText("Preço (R$)");
    expect(priceInput).toHaveValue(49.9);

    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.method).toBe("PATCH");
    expect(captured!.body.priceCents).toBe(4990);
  });
});
