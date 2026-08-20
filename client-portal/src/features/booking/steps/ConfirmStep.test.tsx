import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/test/testUtils";
import { ConfirmStep } from "./ConfirmStep";
import { EMPTY_SELECTION, type BookingSelection } from "../types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SERVICES_RESPONSE = {
  services: [
    {
      id: "svc-corte",
      categoryId: "cat-1",
      name: "Corte de cabelo",
      description: null,
      durationMin: 30,
      bufferAfterMin: 0,
      priceCents: 5000,
      active: true,
      onlineBookable: true,
      category: { id: "cat-1", name: "Cortes", position: 0 },
    },
  ],
};

const BARBER_RESPONSE = { id: "brb-joao", displayName: "João", photoUrl: null, bio: null, status: "ACTIVE" as const };

function mockFetch(overrides: { onCreateAppointment: (body: unknown) => Response }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/services") && !url.includes("/services/")) return jsonResponse(SERVICES_RESPONSE);
    if (url.includes("/barbers/brb-joao")) return jsonResponse(BARBER_RESPONSE);
    if (url.includes("/me/appointments")) return overrides.onCreateAppointment(JSON.parse(String(init?.body ?? "{}")));
    throw new Error(`fetch inesperado em: ${url}`);
  });
}

describe("ConfirmStep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reserva nova: POST /me/appointments manda barberId + serviceIds + startsAt (sem clientNotes vazio)", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    vi.stubGlobal(
      "fetch",
      mockFetch({
        onCreateAppointment: (body) => {
          capturedBody = body;
          return jsonResponse({ id: "appt-1" }, 201);
        },
      }),
    );

    const selection: BookingSelection = {
      ...EMPTY_SELECTION,
      serviceIds: ["svc-corte"],
      barberId: "brb-joao",
      startsAt: "2026-08-24T14:00:00.000Z",
    };
    const onSuccess = vi.fn();
    renderWithQueryClient(<ConfirmStep selection={selection} onChange={vi.fn()} onBack={vi.fn()} onSuccess={onSuccess} />);

    await screen.findByText("João");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(capturedBody).toEqual({
      barberId: "brb-joao",
      serviceIds: ["svc-corte"],
      startsAt: "2026-08-24T14:00:00.000Z",
    });
  });

  it("reserva nova com observação: clientNotes vai no corpo", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    vi.stubGlobal(
      "fetch",
      mockFetch({
        onCreateAppointment: (body) => {
          capturedBody = body;
          return jsonResponse({ id: "appt-1" }, 201);
        },
      }),
    );

    const selection: BookingSelection = {
      ...EMPTY_SELECTION,
      serviceIds: ["svc-corte"],
      barberId: "brb-joao",
      startsAt: "2026-08-24T14:00:00.000Z",
      clientNotes: "Sem máquina zero",
    };
    renderWithQueryClient(<ConfirmStep selection={selection} onChange={vi.fn()} onBack={vi.fn()} onSuccess={vi.fn()} />);

    await screen.findByText("João");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(capturedBody).toEqual({
        barberId: "brb-joao",
        serviceIds: ["svc-corte"],
        startsAt: "2026-08-24T14:00:00.000Z",
        clientNotes: "Sem máquina zero",
      }),
    );
  });

  it('atalho "repetir": POST manda só repeatOf + startsAt, nunca barberId/serviceIds', async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    vi.stubGlobal(
      "fetch",
      mockFetch({
        onCreateAppointment: (body) => {
          capturedBody = body;
          return jsonResponse({ id: "appt-2" }, 201);
        },
      }),
    );

    const selection: BookingSelection = {
      ...EMPTY_SELECTION,
      serviceIds: ["svc-corte"], // preenchido só pro resumo local, não deve ir no payload
      barberId: "brb-joao",
      startsAt: "2026-08-25T10:00:00.000Z",
      repeatOf: { id: "appt-original", barberId: "brb-joao", serviceIds: ["svc-corte"] },
    };
    const onSuccess = vi.fn();
    renderWithQueryClient(<ConfirmStep selection={selection} onChange={vi.fn()} onBack={vi.fn()} onSuccess={onSuccess} />);

    await screen.findByText("João");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(capturedBody).toEqual({
      repeatOf: "appt-original",
      startsAt: "2026-08-25T10:00:00.000Z",
    });
  });

  it("SLOT_TAKEN (409) volta pro passo de data/horário em vez de travar na confirmação", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch({
        onCreateAppointment: () =>
          jsonResponse(
            { type: "about:blank", title: "SLOT_TAKEN", status: 409, detail: "Esse horário acabou de ser preenchido." },
            409,
          ),
      }),
    );

    const selection: BookingSelection = {
      ...EMPTY_SELECTION,
      serviceIds: ["svc-corte"],
      barberId: "brb-joao",
      startsAt: "2026-08-24T14:00:00.000Z",
    };
    const onBack = vi.fn();
    const onSuccess = vi.fn();
    renderWithQueryClient(<ConfirmStep selection={selection} onChange={vi.fn()} onBack={onBack} onSuccess={onSuccess} />);

    await screen.findByText("João");
    await user.click(screen.getByRole("button", { name: "Confirmar" }));

    await waitFor(() => expect(onBack).toHaveBeenCalledOnce());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
