import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/test/testUtils";
import { CompleteAppointmentDialog } from "./CompleteAppointmentDialog";
import type { Appointment } from "@/lib/api/appointments";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const APPOINTMENT: Appointment = {
  id: "appt-1",
  code: "A001",
  kind: "SERVICE",
  clientId: "cli-1",
  barberId: "brb-joao",
  startsAt: "2026-08-24T17:00:00.000Z",
  endsAt: "2026-08-24T17:30:00.000Z",
  status: "EM_ATENDIMENTO",
  totalPriceCents: 5000,
  clientNotes: null,
  internalNotes: null,
  cancelReason: null,
  items: [{ id: "item-1", serviceId: "svc-corte", nameSnapshot: "Corte de cabelo", durationMin: 30, priceCents: 5000, position: 0 }],
  client: { id: "cli-1", fullName: "Maria Souza", user: { phone: "+5511999990000" } },
  barber: { id: "brb-joao", displayName: "João" },
};

interface MockOptions {
  packagesResponse?: unknown;
  loyaltyResponse?: unknown;
  onComplete?: (body: unknown) => Response;
}

function buildFetchMock({ packagesResponse, loyaltyResponse, onComplete }: MockOptions) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/packages")) return jsonResponse(packagesResponse ?? { packages: [] });
    if (url.includes("/loyalty")) return jsonResponse(loyaltyResponse ?? { balance: 0, entries: [] });
    if (url.includes("/complete") && method === "POST") {
      if (!onComplete) throw new Error("onComplete não configurado neste teste");
      return onComplete(JSON.parse(String(init?.body ?? "{}")));
    }
    throw new Error(`fetch inesperado em: ${url} (${method})`);
  });
}

const USABLE_PACKAGE = {
  id: "pkg-active",
  clientId: "cli-1",
  packageId: "p1",
  purchasedAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2027-01-01T00:00:00.000Z",
  creditsTotal: 5,
  status: "ACTIVE" as const,
  creditsRemaining: 3,
  isExpired: false,
  package: { id: "p1", name: "Pacote Corte" },
};

describe("CompleteAppointmentDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('método "PACKAGE" busca pacotes do cliente; outros métodos buscam saldo de fidelidade', async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetchMock({ packagesResponse: { packages: [] }, loyaltyResponse: { balance: 10, entries: [] } });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQueryClient(<CompleteAppointmentDialog appointment={APPOINTMENT} open onOpenChange={() => {}} />);

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/loyalty"))).toBe(true));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/packages"))).toBe(false);

    await user.selectOptions(screen.getByRole("combobox"), "PACKAGE");

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/packages"))).toBe(true));
  });

  it("só pacotes ativos, não expirados e com créditos restantes aparecem no select de pacotes", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      buildFetchMock({
        packagesResponse: {
          packages: [
            USABLE_PACKAGE,
            { ...USABLE_PACKAGE, id: "pkg-expired", isExpired: true, package: { id: "p2", name: "Pacote Expirado" } },
            { ...USABLE_PACKAGE, id: "pkg-sem-credito", creditsRemaining: 0, package: { id: "p3", name: "Pacote Zerado" } },
            { ...USABLE_PACKAGE, id: "pkg-exaurido", status: "EXHAUSTED", package: { id: "p4", name: "Pacote Exaurido" } },
          ],
        },
      }),
    );

    renderWithQueryClient(<CompleteAppointmentDialog appointment={APPOINTMENT} open onOpenChange={() => {}} />);
    await user.selectOptions(screen.getByRole("combobox"), "PACKAGE");

    expect(await screen.findByText(/Pacote Corte —/)).toBeInTheDocument();
    expect(screen.queryByText(/Pacote Expirado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pacote Zerado/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Pacote Exaurido/)).not.toBeInTheDocument();
  });

  it("submit com método PACKAGE manda clientPackageId; outros métodos mandam sem esse campo", async () => {
    const user = userEvent.setup();
    let capturedBody: { payment: Record<string, unknown> } | null = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock({
        packagesResponse: { packages: [USABLE_PACKAGE] },
        onComplete: (body) => {
          capturedBody = body as { payment: Record<string, unknown> };
          return jsonResponse({ ...APPOINTMENT, pointsEarned: 0 }, 200);
        },
      }),
    );

    renderWithQueryClient(<CompleteAppointmentDialog appointment={APPOINTMENT} open onOpenChange={() => {}} />);
    await user.selectOptions(screen.getByRole("combobox"), "PACKAGE");
    await screen.findByText(/Pacote Corte —/);
    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1]!, "pkg-active");

    await user.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.payment).toEqual({ method: "PACKAGE", clientPackageId: "pkg-active" });
  });

  it("método diferente de PACKAGE submete sem a chave clientPackageId", async () => {
    const user = userEvent.setup();
    let capturedBody: { payment: Record<string, unknown> } | null = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock({
        loyaltyResponse: { balance: 10, entries: [] },
        onComplete: (body) => {
          capturedBody = body as { payment: Record<string, unknown> };
          return jsonResponse({ ...APPOINTMENT, pointsEarned: 0 }, 200);
        },
      }),
    );

    renderWithQueryClient(<CompleteAppointmentDialog appointment={APPOINTMENT} open onOpenChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.payment).toEqual({ method: "CASH" });
    expect(capturedBody!.payment).not.toHaveProperty("clientPackageId");
  });

  it("resgate de pontos vazio manda sem a chave redeemPoints; preenchido manda Number(...)", async () => {
    const user = userEvent.setup();
    let capturedBody: { payment: Record<string, unknown> } | null = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock({
        loyaltyResponse: { balance: 10, entries: [] },
        onComplete: (body) => {
          capturedBody = body as { payment: Record<string, unknown> };
          return jsonResponse({ ...APPOINTMENT, pointsEarned: 0 }, 200);
        },
      }),
    );

    renderWithQueryClient(<CompleteAppointmentDialog appointment={APPOINTMENT} open onOpenChange={() => {}} />);
    await user.type(screen.getByLabelText(/Resgatar pontos de fidelidade/), "5");
    await user.click(screen.getByRole("button", { name: "Concluir" }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody!.payment).toEqual({ method: "CASH", redeemPoints: 5 });
  });
});
