import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/testUtils";
import { authSession } from "@/lib/auth/authSession";
import { tokenStore } from "@/lib/auth/tokenStore";
import { NewAppointmentDialog } from "./NewAppointmentDialog";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const CLIENT = { id: "cli-1", fullName: "Maria Souza", phone: "+5511999990000", email: null };

const SERVICE_CORTE = {
  id: "svc-corte",
  categoryId: "cat-1",
  name: "Corte de cabelo",
  description: null,
  durationMin: 30,
  bufferAfterMin: 0,
  priceCents: 5000,
  active: true,
  onlineBookable: true,
};

const SERVICE_BARBA = {
  id: "svc-barba",
  categoryId: "cat-1",
  name: "Barba",
  description: null,
  durationMin: 20,
  bufferAfterMin: 0,
  priceCents: 3000,
  active: true,
  onlineBookable: true,
};

const BARBERS = [
  { id: "brb-joao", displayName: "João", photoUrl: null, bio: null, commissionPct: null, hiredAt: null, status: "ACTIVE" as const },
  { id: "brb-pedro", displayName: "Pedro", photoUrl: null, bio: null, commissionPct: null, hiredAt: null, status: "ACTIVE" as const },
];

interface MockOptions {
  slotsResponse?: unknown;
  onCreateAppointment?: (body: unknown) => Response;
}

function buildFetchMock({ slotsResponse, onCreateAppointment }: MockOptions) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.includes("/clients") && method === "GET") return jsonResponse({ clients: [CLIENT] });
    if (url.includes("/services")) return jsonResponse({ services: [SERVICE_CORTE, SERVICE_BARBA] });
    if (url.includes("/barbers")) return jsonResponse({ barbers: BARBERS });
    if (url.includes("/availability/slots")) {
      return jsonResponse(slotsResponse ?? { barberId: "any", timezone: "America/Sao_Paulo", days: [] });
    }
    if (url.includes("/appointments") && method === "POST") {
      if (!onCreateAppointment) throw new Error("onCreateAppointment não configurado neste teste");
      return onCreateAppointment(JSON.parse(String(init?.body ?? "{}")));
    }
    throw new Error(`fetch inesperado em: ${url} (${method})`);
  });
}

// um único slot, 14:00 em America/Sao_Paulo (17:00 UTC), num único dia
function slotsWithBarberIds(barberIds?: string[]) {
  return {
    barberId: "any",
    timezone: "America/Sao_Paulo",
    days: [
      {
        date: "2026-08-24",
        slots: [{ startsAt: "2026-08-24T17:00:00.000Z", endsAt: "2026-08-24T17:30:00.000Z", barberIds }],
      },
    ],
  };
}

async function selectClient(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("Nome ou telefone do cliente"), "Maria");
  const clientButton = await screen.findByText(CLIENT.fullName, undefined, { timeout: 2000 });
  await user.click(clientButton);
}

async function selectService(user: ReturnType<typeof userEvent.setup>, name = SERVICE_CORTE.name) {
  const checkbox = await screen.findByRole("checkbox", { name: new RegExp(name) });
  await user.click(checkbox);
}

function agendarButton() {
  return screen.getByRole("button", { name: "Agendar" });
}

describe("NewAppointmentDialog", () => {
  beforeEach(() => {
    localStorage.clear();
    authSession.set({ accessToken: "token", role: "ADMIN" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    authSession.set(null);
    tokenStore.clear();
  });

  it('"qualquer barbeiro": clicar um horário resolve barberId a partir de slot.barberIds[0]', async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock({
        slotsResponse: slotsWithBarberIds(["brb-joao", "brb-pedro"]),
        onCreateAppointment: (body) => {
          capturedBody = body;
          return jsonResponse({ id: "appt-1" }, 201);
        },
      }),
    );

    renderWithProviders(<NewAppointmentDialog open onOpenChange={() => {}} />);

    await selectClient(user);
    await selectService(user);
    const slotButton = await screen.findByRole("button", { name: "14:00" });
    await user.click(slotButton);
    await user.click(agendarButton());

    await waitFor(() => expect(capturedBody).toMatchObject({ barberId: "brb-joao" }));
  });

  it('"qualquer barbeiro": clicar um horário sem barberIds não seleciona nada (no-op documentado)', async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", buildFetchMock({ slotsResponse: slotsWithBarberIds(undefined) }));

    renderWithProviders(<NewAppointmentDialog open onOpenChange={() => {}} />);

    await selectClient(user);
    await selectService(user);
    const slotButton = await screen.findByRole("button", { name: "14:00" });
    await user.click(slotButton);

    // slot.barberIds ausente -> slotBarberId cai em undefined -> onClick é
    // um no-op (NewAppointmentDialog.tsx:178); nenhum horário fica
    // selecionado e o botão de submit continua desabilitado.
    expect(agendarButton()).toBeDisabled();
  });

  it("trocar de serviço reseta o horário selecionado", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", buildFetchMock({ slotsResponse: slotsWithBarberIds(["brb-joao"]) }));

    renderWithProviders(<NewAppointmentDialog open onOpenChange={() => {}} />);

    await selectClient(user);
    await selectService(user, SERVICE_CORTE.name);
    const slotButton = await screen.findByRole("button", { name: "14:00" });
    await user.click(slotButton);
    expect(agendarButton()).toBeEnabled();

    await selectService(user, SERVICE_BARBA.name);
    expect(agendarButton()).toBeDisabled();
  });

  it("trocar de barbeiro (admin) reseta o horário selecionado", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", buildFetchMock({ slotsResponse: slotsWithBarberIds(["brb-joao"]) }));

    renderWithProviders(<NewAppointmentDialog open onOpenChange={() => {}} />);

    await selectClient(user);
    await selectService(user);
    const slotButton = await screen.findByRole("button", { name: "14:00" });
    await user.click(slotButton);
    expect(agendarButton()).toBeEnabled();

    await user.selectOptions(screen.getByRole("combobox"), "brb-pedro");
    expect(agendarButton()).toBeDisabled();
  });

  it("SLOT_TAKEN limpa o horário selecionado e refaz o fetch de disponibilidade", async () => {
    const user = userEvent.setup();
    const fetchMock = buildFetchMock({
      slotsResponse: slotsWithBarberIds(["brb-joao"]),
      onCreateAppointment: () =>
        jsonResponse(
          { type: "about:blank", title: "SLOT_TAKEN", status: 409, detail: "Esse horário acabou de ser preenchido." },
          409,
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithProviders(<NewAppointmentDialog open onOpenChange={() => {}} />);

    await selectClient(user);
    await selectService(user);
    const slotButton = await screen.findByRole("button", { name: "14:00" });
    await user.click(slotButton);

    const slotsCallsBefore = fetchMock.mock.calls.filter(([url]) => String(url).includes("/availability/slots")).length;

    await user.click(agendarButton());

    await waitFor(() => expect(agendarButton()).toBeDisabled());

    const slotsCallsAfter = fetchMock.mock.calls.filter(([url]) => String(url).includes("/availability/slots")).length;
    expect(slotsCallsAfter).toBeGreaterThan(slotsCallsBefore);
  });

  it("submit manda o corpo esperado: clientId, barberId do slot, serviceIds, startsAt, sem clientNotes vazio", async () => {
    const user = userEvent.setup();
    let capturedBody: unknown = null;
    vi.stubGlobal(
      "fetch",
      buildFetchMock({
        slotsResponse: slotsWithBarberIds(["brb-joao"]),
        onCreateAppointment: (body) => {
          capturedBody = body;
          return jsonResponse({ id: "appt-1" }, 201);
        },
      }),
    );

    renderWithProviders(<NewAppointmentDialog open onOpenChange={() => {}} />);

    await selectClient(user);
    await selectService(user);
    const slotButton = await screen.findByRole("button", { name: "14:00" });
    await user.click(slotButton);
    await user.click(agendarButton());

    await waitFor(() =>
      expect(capturedBody).toEqual({
        clientId: CLIENT.id,
        barberId: "brb-joao",
        serviceIds: [SERVICE_CORTE.id],
        startsAt: "2026-08-24T17:00:00.000Z",
      }),
    );
  });
});
