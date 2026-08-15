import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "../setup/db.js";
import { createTestApp } from "../setup/app.js";
import { createAdmin, createBarberWithService, createClientUser, seedShopSettings, staffLogin } from "../setup/fixtures.js";
import { nextWeekdayAt } from "../setup/dates.js";

describe("ciclo de vida do agendamento", () => {
  let app: FastifyInstance;
  let accessToken: string;
  let barberId: string;
  let serviceId: string;
  let clientId: string;

  beforeEach(async () => {
    await resetDatabase();
    await seedShopSettings();
    const admin = await createAdmin();
    const { barber, service } = await createBarberWithService();
    const { client } = await createClientUser();
    barberId = barber.id;
    serviceId = service.id;
    clientId = client.id;

    app = await createTestApp();
    ({ accessToken } = await staffLogin(app, admin.user.email!, admin.password));
  });

  afterEach(async () => {
    await app.close();
  });

  function authHeader() {
    return { authorization: `Bearer ${accessToken}` };
  }

  async function createAppointment(startsAt = nextWeekdayAt(10)) {
    const res = await app.inject({
      method: "POST",
      url: "/appointments",
      headers: authHeader(),
      payload: { barberId, clientId, serviceIds: [serviceId], startsAt },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it("segue AGENDADO → CONFIRMADO → EM_ATENDIMENTO → CONCLUÍDO, com histórico completo", async () => {
    const appointment = await createAppointment();
    expect(appointment.status).toBe("AGENDADO");

    let res = await app.inject({ method: "POST", url: `/appointments/${appointment.id}/confirm`, headers: authHeader(), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CONFIRMADO");

    res = await app.inject({ method: "POST", url: `/appointments/${appointment.id}/check-in`, headers: authHeader(), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("EM_ATENDIMENTO");

    res = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "CASH" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CONCLUIDO");

    const historyRes = await app.inject({ method: "GET", url: `/appointments/${appointment.id}/history`, headers: authHeader() });
    const history = historyRes.json().history as { fromStatus: string | null; toStatus: string }[];
    expect(history.map((h) => h.toStatus)).toEqual(["AGENDADO", "CONFIRMADO", "EM_ATENDIMENTO", "CONCLUIDO"]);
    expect(history[0]!.fromStatus).toBeNull();
  });

  it("complete aceita direto de CONFIRMADO (check-in é opcional)", async () => {
    const appointment = await createAppointment();
    await app.inject({ method: "POST", url: `/appointments/${appointment.id}/confirm`, headers: authHeader(), payload: {} });

    const res = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "PIX" } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("CONCLUIDO");
  });

  it("recusa concluir direto de AGENDADO (pulando confirmação)", async () => {
    const appointment = await createAppointment();
    const res = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/complete`,
      headers: authHeader(),
      payload: { payment: { method: "CASH" } },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().title).toBe("INVALID_TRANSITION");
  });

  it("recusa marcar falta a partir de AGENDADO (só depois de CONFIRMADO)", async () => {
    const appointment = await createAppointment();
    const res = await app.inject({ method: "POST", url: `/appointments/${appointment.id}/no-show`, headers: authHeader(), payload: {} });
    expect(res.statusCode).toBe(409);
  });

  it("cliente não pode cancelar fora do prazo mínimo; admin pode a qualquer momento", async () => {
    // prazo absurdamente alto garante que QUALQUER horário futuro já está "fora do prazo" pro cliente
    await seedShopSettings({ cancelDeadlineHours: 999_999 });
    const appointment = await createAppointment();

    const asClient = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/cancel`,
      headers: authHeader(),
      payload: { actorType: "CLIENT" },
    });
    expect(asClient.statusCode).toBe(409);
    expect(asClient.json().title).toBe("CANCEL_DEADLINE_PASSED");

    const asAdmin = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/cancel`,
      headers: authHeader(),
      payload: { actorType: "ADMIN" },
    });
    expect(asAdmin.statusCode).toBe(200);
    expect(asAdmin.json().status).toBe("CANCELADO");
  });

  it("remarcar move o horário e volta o status para AGENDADO", async () => {
    const appointment = await createAppointment();
    await app.inject({ method: "POST", url: `/appointments/${appointment.id}/confirm`, headers: authHeader(), payload: {} });

    const newStartsAt = nextWeekdayAt(11);
    const res = await app.inject({
      method: "POST",
      url: `/appointments/${appointment.id}/reschedule`,
      headers: authHeader(),
      payload: { startsAt: newStartsAt },
    });
    expect(res.statusCode).toBe(200);
    const rescheduled = res.json();
    expect(rescheduled.status).toBe("AGENDADO");
    expect(new Date(rescheduled.startsAt).toISOString()).toBe(new Date(newStartsAt).toISOString());
  });
});
