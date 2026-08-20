import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/test/testUtils";
import { RescheduleDialog } from "./RescheduleDialog";
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
  startsAt: "2026-08-20T17:00:00.000Z",
  endsAt: "2026-08-20T17:30:00.000Z",
  status: "AGENDADO",
  totalPriceCents: 5000,
  clientNotes: null,
  internalNotes: null,
  cancelReason: null,
  items: [{ id: "item-1", serviceId: "svc-corte", nameSnapshot: "Corte de cabelo", durationMin: 30, priceCents: 5000, position: 0 }],
  client: { id: "cli-1", fullName: "Maria Souza", user: { phone: "+5511999990000" } },
  barber: { id: "brb-joao", displayName: "João" },
};

const TWO_SLOTS = {
  barberId: "brb-joao",
  timezone: "America/Sao_Paulo",
  days: [
    {
      date: "2026-08-24",
      slots: [
        { startsAt: "2026-08-24T17:00:00.000Z", endsAt: "2026-08-24T17:30:00.000Z" },
        { startsAt: "2026-08-24T17:30:00.000Z", endsAt: "2026-08-24T18:00:00.000Z" },
      ],
    },
  ],
};

describe("RescheduleDialog", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clicar um horário remarca imediatamente, sem passo de confirmação", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.includes("/availability/slots")) return jsonResponse(TWO_SLOTS);
        if (url.includes("/reschedule") && method === "POST") {
          capturedBody = JSON.parse(String(init?.body ?? "{}"));
          return jsonResponse(APPOINTMENT, 200);
        }
        throw new Error(`fetch inesperado em: ${url}`);
      }),
    );

    renderWithQueryClient(<RescheduleDialog appointment={APPOINTMENT} open onOpenChange={() => {}} />);

    // não existe nenhum botão de confirmação neste fluxo — diferente do
    // NewAppointmentDialog (2 passos), aqui um clique já basta.
    expect(screen.queryByRole("button", { name: /confirmar/i })).not.toBeInTheDocument();

    const slotButton = await screen.findByRole("button", { name: "14:00" });
    await user.click(slotButton);

    await waitFor(() => expect(capturedBody).toEqual({ startsAt: "2026-08-24T17:00:00.000Z" }));
  });

  it("todos os botões de horário ficam desabilitados durante a requisição pendente", async () => {
    const user = userEvent.setup();
    let resolveReschedule!: (res: Response) => void;
    const pendingPromise = new Promise<Response>((resolve) => {
      resolveReschedule = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";
        if (url.includes("/availability/slots")) return jsonResponse(TWO_SLOTS);
        if (url.includes("/reschedule") && method === "POST") return pendingPromise;
        throw new Error(`fetch inesperado em: ${url}`);
      }),
    );

    renderWithQueryClient(<RescheduleDialog appointment={APPOINTMENT} open onOpenChange={() => {}} />);

    const slot1 = await screen.findByRole("button", { name: "14:00" });
    const slot2 = screen.getByRole("button", { name: "14:30" });
    await user.click(slot1);

    await waitFor(() => expect(slot1).toBeDisabled());
    expect(slot2).toBeDisabled();

    resolveReschedule(jsonResponse(APPOINTMENT, 200));
  });
});
