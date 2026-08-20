import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithQueryClient } from "@/test/testUtils";
import { DateTimeStep } from "./DateTimeStep";
import { EMPTY_SELECTION } from "../types";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("DateTimeStep", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('"qualquer barbeiro": escolher um horário resolve o barberId a partir de slot.barberIds[0]', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/availability/slots")) {
        return jsonResponse({
          barberId: "any",
          timezone: "America/Sao_Paulo",
          days: [
            {
              date: "2026-08-24",
              // 17:00 UTC = 14:00 em America/Sao_Paulo (UTC-3) — o que a
              // tela mostra é a hora LOCAL, não a crua do payload.
              slots: [{ startsAt: "2026-08-24T17:00:00.000Z", endsAt: "2026-08-24T17:30:00.000Z", barberIds: ["brb-joao", "brb-pedro"] }],
            },
          ],
        });
      }
      throw new Error(`fetch inesperado em: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onChange = vi.fn();
    const onNext = vi.fn();
    renderWithQueryClient(
      <DateTimeStep
        selection={{ ...EMPTY_SELECTION, serviceIds: ["svc-corte"], barberMode: "any" }}
        onChange={onChange}
        onNext={onNext}
        onBack={vi.fn()}
      />,
    );

    const slotButton = await screen.findByRole("button", { name: "14:00" });
    await user.click(slotButton);

    // resolve o PRIMEIRO barbeiro da lista — o cliente não expressou preferência
    expect(onChange).toHaveBeenCalledWith({ barberId: "brb-joao", startsAt: "2026-08-24T17:00:00.000Z" });
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('"qualquer barbeiro": sem nenhum dia com vaga, mostra mensagem em vez de tela vazia', async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ barberId: "any", timezone: "America/Sao_Paulo", days: [] })),
    );

    renderWithQueryClient(
      <DateTimeStep
        selection={{ ...EMPTY_SELECTION, serviceIds: ["svc-corte"], barberMode: "any" }}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(await screen.findByText(/Nenhum horário disponível/)).toBeInTheDocument();
  });

  it("barbeiro específico: escolher um dia disponível e depois um horário chama onChange/onNext sem alterar barberId", async () => {
    const user = userEvent.setup();

    // "amanhã" em vez de uma data fixa — evita depender de fake timers (que
    // conflitam com a espera assíncrona do userEvent/TanStack Query) e
    // continua determinístico: o `disabled` do Calendar só depende do mock
    // de `days`, não da agenda real de nenhum barbeiro.
    const target = new Date();
    target.setDate(target.getDate() + 1);
    target.setHours(0, 0, 0, 0);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, "0");
    const d = String(target.getDate()).padStart(2, "0");
    const targetISODate = `${y}-${m}-${d}`;
    // 17:00 UTC = 14:00 em America/Sao_Paulo (UTC-3 fixo, sem horário de
    // verão) — construído direto em UTC pra não depender do fuso de quem
    // roda o teste (CI normalmente roda em UTC, não seria igual ao horário
    // "local" do runner se eu derivasse isso de `target`).
    const targetStartsAt = `${targetISODate}T17:00:00.000Z`;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/availability/days")) {
        return jsonResponse({ barberId: "brb-joao", month: `${y}-${m}`, days: [targetISODate] });
      }
      if (url.includes("/availability/slots")) {
        return jsonResponse({
          barberId: "brb-joao",
          totalDurationMin: 30,
          timezone: "America/Sao_Paulo",
          days: [{ date: targetISODate, slots: [{ startsAt: targetStartsAt, endsAt: `${targetISODate}T17:30:00.000Z` }] }],
        });
      }
      throw new Error(`fetch inesperado em: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const onChange = vi.fn();
    const onNext = vi.fn();
    const { container } = renderWithQueryClient(
      <DateTimeStep
        selection={{ ...EMPTY_SELECTION, serviceIds: ["svc-corte"], barberMode: "specific", barberId: "brb-joao" }}
        onChange={onChange}
        onNext={onNext}
        onBack={vi.fn()}
      />,
    );

    // `CalendarDayButton` marca cada dia com `data-day={date.toLocaleDateString()}`
    // — mesmo runtime, mesmo formato, sem depender da localização em inglês
    // que o date-fns interno do calendário gera pro aria-label.
    const dayButton = await vi.waitUntil(() => container.querySelector(`[data-day="${target.toLocaleDateString()}"]`), {
      timeout: 2000,
    });
    // fireEvent, não userEvent, pra este clique específico — react-day-picker
    // usa tabindex roving (só o dia "focado" tem tabindex=0) e a heurística de
    // "elemento clicável" do userEvent não reconhece isso em jsdom; fireEvent
    // dispara o evento direto, sem essa checagem extra.
    fireEvent.click(dayButton as Element);

    const slotButton = await screen.findByRole("button", { name: /^\d{2}:\d{2}$/ });
    await user.click(slotButton);

    expect(onChange).toHaveBeenCalledWith({ startsAt: targetStartsAt });
    expect(onChange).not.toHaveBeenCalledWith(expect.objectContaining({ barberId: expect.anything() }));
    expect(onNext).toHaveBeenCalledOnce();
  });
});
